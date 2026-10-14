import type { Prisma } from "@/generated/prisma/client";

import { recordAudit } from "../audit";
import { db } from "../db";
import { parseLocalDateTime } from "../domain/tasks";
import { parseInput } from "../errors";
import { assertCan, type Ctx } from "../permissions";
import { activitySchema } from "../validation/schemas";
import { assertCompanyRef, assertContactRef, assertDealRef, notFoundUnless } from "./guards";

export type TimelineTarget = { contactId: string } | { companyId: string } | { dealId: string };

const timelineInclude = {
  author: { select: { id: true, name: true } },
  contact: { select: { id: true, firstName: true, lastName: true } },
  company: { select: { id: true, name: true } },
  deal: { select: { id: true, title: true } },
} satisfies Prisma.ActivityInclude;

function timelineWhere(ctx: Ctx, target: TimelineTarget): Prisma.ActivityWhereInput {
  if ("contactId" in target) return { workspaceId: ctx.workspaceId, contactId: target.contactId };
  if ("dealId" in target) return { workspaceId: ctx.workspaceId, dealId: target.dealId };
  // A company's timeline also shows what happened with its people and deals.
  return {
    workspaceId: ctx.workspaceId,
    OR: [
      { companyId: target.companyId },
      { contact: { companyId: target.companyId } },
      { deal: { companyId: target.companyId } },
    ],
  };
}

export async function listTimeline(ctx: Ctx, target: TimelineTarget, limit = 50) {
  assertCan(ctx, "records:read");
  return db.activity.findMany({
    where: timelineWhere(ctx, target),
    include: timelineInclude,
    orderBy: [{ occurredAt: "desc" }, { id: "asc" }],
    take: limit,
  });
}

export async function listRecentActivities(ctx: Ctx, limit = 8) {
  assertCan(ctx, "records:read");
  return db.activity.findMany({
    where: { workspaceId: ctx.workspaceId },
    include: timelineInclude,
    orderBy: [{ occurredAt: "desc" }, { id: "asc" }],
    take: limit,
  });
}

export async function logActivity(
  ctx: Ctx,
  rawInput: unknown,
  options: { timeZone?: string; now?: Date } = {},
) {
  assertCan(ctx, "records:write");
  const input = parseInput(activitySchema, rawInput);
  return db.$transaction(async (tx) => {
    await assertContactRef(tx, ctx, input.contactId);
    await assertCompanyRef(tx, ctx, input.companyId);
    await assertDealRef(tx, ctx, input.dealId);
    const activity = await tx.activity.create({
      data: {
        workspaceId: ctx.workspaceId,
        type: input.type,
        subject: input.subject,
        body: input.body,
        occurredAt: input.occurredAt
          ? parseLocalDateTime(input.occurredAt, options.timeZone ?? "UTC")
          : (options.now ?? new Date()),
        contactId: input.contactId,
        companyId: input.companyId,
        dealId: input.dealId,
        authorId: ctx.userId,
      },
    });
    await recordAudit(tx, ctx, {
      action: "activity.created",
      entityType: "activity",
      entityId: activity.id,
      changes: { type: activity.type, subject: activity.subject },
    });
    return activity;
  });
}

export async function deleteActivity(ctx: Ctx, id: string): Promise<void> {
  assertCan(ctx, "records:write");
  await db.$transaction(async (tx) => {
    const activity = notFoundUnless(
      await tx.activity.findFirst({ where: { id, workspaceId: ctx.workspaceId } }),
      "Activity",
    );
    await tx.activity.delete({ where: { id: activity.id } });
    await recordAudit(tx, ctx, {
      action: "activity.deleted",
      entityType: "activity",
      entityId: activity.id,
      changes: { type: activity.type, subject: activity.subject },
    });
  });
}
