import { recordAudit } from "../audit";
import { db } from "../db";
import { ConflictError, parseInput } from "../errors";
import { assertCan, type Ctx } from "../permissions";
import { tagSchema } from "../validation/schemas";
import { notFoundUnless } from "./guards";

export const TAG_COLORS = [
  "slate",
  "red",
  "amber",
  "green",
  "teal",
  "blue",
  "indigo",
  "pink",
] as const;

export async function listTags(ctx: Ctx) {
  assertCan(ctx, "records:read");
  return db.tag.findMany({
    where: { workspaceId: ctx.workspaceId },
    orderBy: { name: "asc" },
    include: { _count: { select: { contacts: true, companies: true } } },
  });
}

async function assertNameFree(ctx: Ctx, name: string, exceptId?: string) {
  const clash = await db.tag.findFirst({
    where: {
      workspaceId: ctx.workspaceId,
      name: { equals: name, mode: "insensitive" },
      ...(exceptId ? { id: { not: exceptId } } : {}),
    },
    select: { id: true },
  });
  if (clash)
    throw new ConflictError("A tag with this name already exists.", { name: ["Already in use."] });
}

export async function createTag(ctx: Ctx, rawInput: unknown) {
  assertCan(ctx, "settings:manage");
  const input = parseInput(tagSchema, rawInput);
  await assertNameFree(ctx, input.name);
  return db.$transaction(async (tx) => {
    const tag = await tx.tag.create({ data: { ...input, workspaceId: ctx.workspaceId } });
    await recordAudit(tx, ctx, {
      action: "tag.created",
      entityType: "tag",
      entityId: tag.id,
      changes: { name: tag.name, color: tag.color },
    });
    return tag;
  });
}

export async function updateTag(ctx: Ctx, id: string, rawInput: unknown) {
  assertCan(ctx, "settings:manage");
  const input = parseInput(tagSchema, rawInput);
  const existing = notFoundUnless(
    await db.tag.findFirst({ where: { id, workspaceId: ctx.workspaceId } }),
    "Tag",
  );
  await assertNameFree(ctx, input.name, id);
  return db.$transaction(async (tx) => {
    const tag = await tx.tag.update({ where: { id: existing.id }, data: input });
    await recordAudit(tx, ctx, {
      action: "tag.updated",
      entityType: "tag",
      entityId: tag.id,
      changes: {
        name: { from: existing.name, to: tag.name },
        color: { from: existing.color, to: tag.color },
      },
    });
    return tag;
  });
}

export async function deleteTag(ctx: Ctx, id: string): Promise<void> {
  assertCan(ctx, "settings:manage");
  await db.$transaction(async (tx) => {
    const existing = notFoundUnless(
      await tx.tag.findFirst({ where: { id, workspaceId: ctx.workspaceId } }),
      "Tag",
    );
    await tx.tag.delete({ where: { id: existing.id } });
    await recordAudit(tx, ctx, {
      action: "tag.deleted",
      entityType: "tag",
      entityId: existing.id,
      changes: { name: existing.name },
    });
  });
}
