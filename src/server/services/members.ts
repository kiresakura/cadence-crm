import type { Role } from "@/generated/prisma/enums";

import { recordAudit } from "../audit";
import { generateTemporaryPassword, hashPassword } from "../auth/password";
import { db, type DbClient } from "../db";
import { isDemoEmail } from "../env";
import { ConflictError, ForbiddenError, ValidationError, parseInput } from "../errors";
import { assertCan, type Ctx } from "../permissions";
import { addMemberSchema, changeRoleSchema } from "../validation/schemas";
import { notFoundUnless } from "./guards";

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

/**
 * Adds someone to the workspace. New people get an account with a temporary password that
 * is shown once to the admin (no email is sent in this version).
 */
export async function addMember(ctx: Ctx, rawInput: unknown) {
  assertCan(ctx, "members:manage");
  const input = parseInput(addMemberSchema, rawInput);
  assertCanAssignRole(ctx, input.role);
  if (isDemoEmail(input.email)) {
    throw ValidationError.forField("email", "This email domain is reserved for demo accounts.");
  }

  const existingUser = await db.user.findUnique({ where: { email: input.email } });
  const temporaryPassword = existingUser ? null : generateTemporaryPassword();
  const passwordHash = temporaryPassword ? await hashPassword(temporaryPassword) : null;

  const membership = await db.$transaction(async (tx) => {
    let userId = existingUser?.id;
    if (userId) {
      const already = await tx.membership.findUnique({
        where: { workspaceId_userId: { workspaceId: ctx.workspaceId, userId } },
      });
      if (already) {
        throw new ConflictError("This person is already a member.", {
          email: ["Already a member of this workspace."],
        });
      }
    } else {
      const user = await tx.user.create({
        data: { email: input.email, name: input.name, passwordHash: passwordHash as string },
      });
      userId = user.id;
    }
    const created = await tx.membership.create({
      data: { workspaceId: ctx.workspaceId, userId, role: input.role },
      include: { user: { select: { id: true, name: true, email: true } } },
    });
    await recordAudit(tx, ctx, {
      action: "member.added",
      entityType: "member",
      entityId: created.id,
      changes: { email: created.user.email, role: created.role, newAccount: !existingUser },
    });
    return created;
  });

  return { membership, temporaryPassword };
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

export async function removeMember(ctx: Ctx, membershipId: string): Promise<void> {
  assertCan(ctx, "members:manage");
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
      changes: { email: target.user.email, role: target.role },
    });
  });
}
