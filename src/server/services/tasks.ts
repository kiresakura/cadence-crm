import type { Prisma } from "@/generated/prisma/client";

import { recordAudit } from "../audit";
import { db } from "../db";
import { parseLocalDateTime, type TaskView, type TaskWindows } from "../domain/tasks";
import { parseInput } from "../errors";
import { assertCan, type Ctx } from "../permissions";
import { taskSchema, type TaskInput } from "../validation/schemas";
import {
  assertCompanyRef,
  assertContactRef,
  assertDealRef,
  assertMemberRef,
  notFoundUnless,
} from "./guards";

const taskInclude = {
  assignee: { select: { id: true, name: true } },
  contact: { select: { id: true, firstName: true, lastName: true } },
  company: { select: { id: true, name: true } },
  deal: { select: { id: true, title: true } },
} satisfies Prisma.TaskInclude;

function viewWhere(view: TaskView, windows: TaskWindows): Prisma.TaskWhereInput {
  switch (view) {
    case "overdue":
      return { completedAt: null, dueAt: { lt: windows.now } };
    case "today":
      return { completedAt: null, dueAt: { gte: windows.startOfToday, lte: windows.endOfToday } };
    case "upcoming":
      return { completedAt: null, dueAt: { gt: windows.endOfToday, lte: windows.endOfUpcoming } };
    case "completed":
      return { completedAt: { not: null } };
    default:
      return { completedAt: null };
  }
}

/** The signed-in user's tasks for one view, plus counts for the view tabs. */
export async function listMyTasks(ctx: Ctx, view: TaskView, windows: TaskWindows) {
  assertCan(ctx, "records:read");
  const base: Prisma.TaskWhereInput = { workspaceId: ctx.workspaceId, assigneeId: ctx.userId };
  const orderBy: Prisma.TaskOrderByWithRelationInput[] =
    view === "completed"
      ? [{ completedAt: "desc" }, { id: "asc" }]
      : [{ dueAt: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }];
  const [items, mine, overdue, today, upcoming] = await Promise.all([
    db.task.findMany({
      where: { ...base, ...viewWhere(view, windows) },
      include: taskInclude,
      orderBy,
      take: 200,
    }),
    db.task.count({ where: { ...base, ...viewWhere("mine", windows) } }),
    db.task.count({ where: { ...base, ...viewWhere("overdue", windows) } }),
    db.task.count({ where: { ...base, ...viewWhere("today", windows) } }),
    db.task.count({ where: { ...base, ...viewWhere("upcoming", windows) } }),
  ]);
  return { items, counts: { mine, overdue, today, upcoming } };
}

export async function listTasksFor(
  ctx: Ctx,
  target: { contactId: string } | { companyId: string } | { dealId: string },
) {
  assertCan(ctx, "records:read");
  return db.task.findMany({
    where: { workspaceId: ctx.workspaceId, ...target },
    include: taskInclude,
    orderBy: [{ completedAt: { sort: "desc", nulls: "first" } }, { dueAt: "asc" }],
    take: 50,
  });
}

export async function countOverdueTasks(ctx: Ctx, now: Date) {
  assertCan(ctx, "records:read");
  return db.task.count({
    where: { workspaceId: ctx.workspaceId, completedAt: null, dueAt: { lt: now } },
  });
}

function taskData(input: TaskInput, timeZone: string) {
  return {
    title: input.title,
    dueAt: input.dueAt ? parseLocalDateTime(input.dueAt, timeZone) : null,
    priority: input.priority,
    contactId: input.contactId,
    companyId: input.companyId,
    dealId: input.dealId,
  };
}

export async function createTask(ctx: Ctx, rawInput: unknown, timeZone = "UTC") {
  assertCan(ctx, "records:write");
  const input = parseInput(taskSchema, rawInput);
  return db.$transaction(async (tx) => {
    const assigneeId = input.assigneeId ?? ctx.userId;
    await assertMemberRef(tx, ctx, assigneeId, "assigneeId");
    await assertContactRef(tx, ctx, input.contactId);
    await assertCompanyRef(tx, ctx, input.companyId);
    await assertDealRef(tx, ctx, input.dealId);
    const task = await tx.task.create({
      data: {
        ...taskData(input, timeZone),
        assigneeId,
        createdById: ctx.userId,
        workspaceId: ctx.workspaceId,
      },
    });
    await recordAudit(tx, ctx, {
      action: "task.created",
      entityType: "task",
      entityId: task.id,
      changes: { title: task.title, dueAt: task.dueAt },
    });
    return task;
  });
}

export async function updateTask(ctx: Ctx, id: string, rawInput: unknown, timeZone = "UTC") {
  assertCan(ctx, "records:write");
  const input = parseInput(taskSchema, rawInput);
  return db.$transaction(async (tx) => {
    const existing = notFoundUnless(
      await tx.task.findFirst({ where: { id, workspaceId: ctx.workspaceId } }),
      "Task",
    );
    // Someone who left the workspace stays assigned until another assignee is chosen.
    if (input.assigneeId !== existing.assigneeId) {
      await assertMemberRef(tx, ctx, input.assigneeId, "assigneeId");
    }
    await assertContactRef(tx, ctx, input.contactId);
    await assertCompanyRef(tx, ctx, input.companyId);
    await assertDealRef(tx, ctx, input.dealId);
    const task = await tx.task.update({
      where: { id: existing.id },
      data: { ...taskData(input, timeZone), assigneeId: input.assigneeId ?? existing.assigneeId },
    });
    await recordAudit(tx, ctx, {
      action: "task.updated",
      entityType: "task",
      entityId: task.id,
      changes: { title: task.title, dueAt: task.dueAt },
    });
    return task;
  });
}

export async function setTaskCompleted(ctx: Ctx, id: string, completed: boolean, now = new Date()) {
  assertCan(ctx, "records:write");
  return db.$transaction(async (tx) => {
    const existing = notFoundUnless(
      await tx.task.findFirst({ where: { id, workspaceId: ctx.workspaceId } }),
      "Task",
    );
    if (Boolean(existing.completedAt) === completed) return existing;
    const task = await tx.task.update({
      where: { id: existing.id },
      data: { completedAt: completed ? now : null },
    });
    await recordAudit(tx, ctx, {
      action: completed ? "task.completed" : "task.reopened",
      entityType: "task",
      entityId: task.id,
      changes: { title: task.title },
    });
    return task;
  });
}

export async function deleteTask(ctx: Ctx, id: string): Promise<void> {
  assertCan(ctx, "records:write");
  await db.$transaction(async (tx) => {
    const existing = notFoundUnless(
      await tx.task.findFirst({ where: { id, workspaceId: ctx.workspaceId } }),
      "Task",
    );
    await tx.task.delete({ where: { id: existing.id } });
    await recordAudit(tx, ctx, {
      action: "task.deleted",
      entityType: "task",
      entityId: existing.id,
      changes: { title: existing.title },
    });
  });
}
