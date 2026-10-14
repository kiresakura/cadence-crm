import type { Role } from "@/generated/prisma/enums";

import { recordAudit } from "../audit";
import { db, type DbClient } from "../db";
import { ConflictError, ForbiddenError, ValidationError, parseInput } from "../errors";
import { assertCan, type Ctx } from "../permissions";
import { changeRoleSchema, removeMemberSchema } from "../validation/schemas";
import { assertMemberRef, notFoundUnless } from "./guards";

export async function listMembers(ctx: Ctx) {
  assertCan(ctx, "records:read");
  return db.membership.findMany({
    where: { workspaceId: ctx.workspaceId },
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
  });
}

/** Members for owner/assignee pickers. */
export async function memberOptions(ctx: Ctx) {
  const members = await listMembers(ctx);
  return members.map((member) => ({ id: member.user.id, label: member.user.name }));
}

function assertCanAssignRole(ctx: Ctx, role: Role) {
  if (role === "OWNER" && ctx.role !== "OWNER") {
    throw new ForbiddenError("Only owners can grant the owner role.");
  }
}

async function ownerCount(tx: DbClient, workspaceId: string) {
  return tx.membership.count({ where: { workspaceId, role: "OWNER" } });
}

export async function changeMemberRole(ctx: Ctx, membershipId: string, rawInput: unknown) {
  assertCan(ctx, "members:manage");
  const input = parseInput(changeRoleSchema, rawInput);
  return db.$transaction(async (tx) => {
    const target = notFoundUnless(
      await tx.membership.findFirst({ where: { id: membershipId, workspaceId: ctx.workspaceId } }),
      "Member",
    );
    if (target.role === input.role) return target;
    if (target.role === "OWNER" && ctx.role !== "OWNER") {
      throw new ForbiddenError("Only owners can change another owner's role.");
    }
    assertCanAssignRole(ctx, input.role);
    if (target.role === "OWNER" && (await ownerCount(tx, ctx.workspaceId)) <= 1) {
      throw new ConflictError("A workspace needs at least one owner.");
    }
    const updated = await tx.membership.update({
      where: { id: target.id },
      data: { role: input.role },
    });
    await recordAudit(tx, ctx, {
      action: "member.role_changed",
      entityType: "member",
      entityId: target.id,
      changes: { role: { from: target.role, to: updated.role } },
    });
    return updated;
  });
}

/**
 * Removes a member. Their contacts, companies, deals and open tasks in this workspace move to
 * `transferToUserId` (the person removing them by default) in the same transaction, so no
 * record is left with an owner who can no longer be chosen.
 */
export async function removeMember(
  ctx: Ctx,
  membershipId: string,
  rawInput: unknown = {},
): Promise<void> {
  assertCan(ctx, "members:manage");
  const input = parseInput(removeMemberSchema, rawInput);
  await db.$transaction(async (tx) => {
    const target = notFoundUnless(
      await tx.membership.findFirst({
        where: { id: membershipId, workspaceId: ctx.workspaceId },
        include: { user: { select: { email: true } } },
      }),
      "Member",
    );
    if (target.role === "OWNER") {
      if (ctx.role !== "OWNER") throw new ForbiddenError("Only owners can remove an owner.");
      if ((await ownerCount(tx, ctx.workspaceId)) <= 1) {
        throw new ConflictError("A workspace needs at least one owner.");
      }
    }
    const transferTo = input.transferToUserId ?? ctx.userId;
    if (transferTo === target.userId) {
      throw ValidationError.forField(
        "transferToUserId",
        "Choose someone other than the member being removed.",
      );
    }
    await assertMemberRef(tx, ctx, transferTo, "transferToUserId");
    const owned = { workspaceId: ctx.workspaceId, ownerId: target.userId };
    const handover = { ownerId: transferTo };
    const transferred = {
      contacts: (await tx.contact.updateMany({ where: owned, data: handover })).count,
      companies: (await tx.company.updateMany({ where: owned, data: handover })).count,
      deals: (await tx.deal.updateMany({ where: owned, data: handover })).count,
      openTasks: (
        await tx.task.updateMany({
          where: { workspaceId: ctx.workspaceId, assigneeId: target.userId, completedAt: null },
          data: { assigneeId: transferTo },
        })
      ).count,
    };

    await tx.membership.delete({ where: { id: target.id } });
    // Signed-in sessions lose access immediately: membership is checked on every request.
    await tx.session.updateMany({
      where: { userId: target.userId, workspaceId: ctx.workspaceId },
      data: { workspaceId: null },
    });
    await recordAudit(tx, ctx, {
      action: "member.removed",
      entityType: "member",
      entityId: target.id,
      changes: {
        email: target.user.email,
        role: target.role,
        transferredTo: transferTo,
        transferred,
      },
    });
  });
}
