import { recordAudit } from "../audit";
import { db, type DbClient } from "../db";
import { DEFAULT_STAGES, assertStageSetComplete } from "../domain/deal-stage";
import { ConflictError, ValidationError, parseInput } from "../errors";
import { assertCan, type Ctx } from "../permissions";
import { pipelineSchema, stageSchema } from "../validation/schemas";
import { notFoundUnless } from "./guards";

export async function listPipelines(ctx: Ctx) {
  assertCan(ctx, "records:read");
  return db.pipeline.findMany({
    where: { workspaceId: ctx.workspaceId },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    include: {
      stages: {
        orderBy: { position: "asc" },
        include: { _count: { select: { deals: true } } },
      },
    },
  });
}

/** Creates a pipeline with the default stage set. Also used when a workspace is created. */
export async function insertPipelineWithDefaults(
  tx: DbClient,
  workspaceId: string,
  name: string,
  position: number,
) {
  return tx.pipeline.create({
    data: {
      workspaceId,
      name,
      position,
      stages: {
        create: DEFAULT_STAGES.map((stage, index) => ({
          ...stage,
          workspaceId,
          position: index,
        })),
      },
    },
  });
}

async function getPipeline(tx: DbClient, ctx: Ctx, id: string) {
  return notFoundUnless(
    await tx.pipeline.findFirst({
      where: { id, workspaceId: ctx.workspaceId },
      include: { stages: { orderBy: { position: "asc" } } },
    }),
    "Pipeline",
  );
}

export async function createPipeline(ctx: Ctx, rawInput: unknown) {
  assertCan(ctx, "settings:manage");
  const input = parseInput(pipelineSchema, rawInput);
  return db.$transaction(async (tx) => {
    const count = await tx.pipeline.count({ where: { workspaceId: ctx.workspaceId } });
    const pipeline = await insertPipelineWithDefaults(tx, ctx.workspaceId, input.name, count);
    await recordAudit(tx, ctx, {
      action: "pipeline.created",
      entityType: "pipeline",
      entityId: pipeline.id,
      changes: { name: pipeline.name },
    });
    return pipeline;
  });
}

export async function renamePipeline(ctx: Ctx, id: string, rawInput: unknown) {
  assertCan(ctx, "settings:manage");
  const input = parseInput(pipelineSchema, rawInput);
  return db.$transaction(async (tx) => {
    const pipeline = await getPipeline(tx, ctx, id);
    const updated = await tx.pipeline.update({ where: { id }, data: { name: input.name } });
    await recordAudit(tx, ctx, {
      action: "pipeline.renamed",
      entityType: "pipeline",
      entityId: id,
      changes: { name: { from: pipeline.name, to: updated.name } },
    });
    return updated;
  });
}

export async function deletePipeline(ctx: Ctx, id: string): Promise<void> {
  assertCan(ctx, "settings:manage");
  await db.$transaction(async (tx) => {
    const pipeline = await getPipeline(tx, ctx, id);
    const [pipelineCount, dealCount] = await Promise.all([
      tx.pipeline.count({ where: { workspaceId: ctx.workspaceId } }),
      tx.deal.count({ where: { workspaceId: ctx.workspaceId, pipelineId: id } }),
    ]);
    if (pipelineCount <= 1) throw new ConflictError("A workspace needs at least one pipeline.");
    if (dealCount > 0) {
      throw new ConflictError("Move or delete this pipeline's deals before deleting it.");
    }
    await tx.pipeline.delete({ where: { id } });
    await recordAudit(tx, ctx, {
      action: "pipeline.deleted",
      entityType: "pipeline",
      entityId: id,
      changes: { name: pipeline.name },
    });
  });
}

export async function addStage(ctx: Ctx, pipelineId: string, rawInput: unknown) {
  assertCan(ctx, "settings:manage");
  const input = parseInput(stageSchema, rawInput);
  return db.$transaction(async (tx) => {
    const pipeline = await getPipeline(tx, ctx, pipelineId);
    // New open stages go before the first closed stage so the board keeps its shape.
    const firstClosed = pipeline.stages.find((stage) => stage.type !== "OPEN");
    const position =
      input.type === "OPEN" && firstClosed ? firstClosed.position : pipeline.stages.length;
    if (input.type === "OPEN" && firstClosed) {
      await tx.stage.updateMany({
        where: { pipelineId, position: { gte: position } },
        data: { position: { increment: 1 } },
      });
    }
    const stage = await tx.stage.create({
      data: { ...input, position, pipelineId, workspaceId: ctx.workspaceId },
    });
    await recordAudit(tx, ctx, {
      action: "stage.created",
      entityType: "stage",
      entityId: stage.id,
      changes: { pipeline: pipeline.name, name: stage.name, type: stage.type },
    });
    return stage;
  });
}

export async function updateStage(ctx: Ctx, stageId: string, rawInput: unknown) {
  assertCan(ctx, "settings:manage");
  const input = parseInput(stageSchema, rawInput);
  return db.$transaction(async (tx) => {
    const stage = notFoundUnless(
      await tx.stage.findFirst({
        where: { id: stageId, workspaceId: ctx.workspaceId },
        include: { pipeline: { include: { stages: true } }, _count: { select: { deals: true } } },
      }),
      "Stage",
    );
    if (input.type !== stage.type) {
      if (stage._count.deals > 0) {
        throw ValidationError.forField(
          "type",
          "Move this stage's deals elsewhere before changing its type.",
        );
      }
      assertStageSetComplete(
        stage.pipeline.stages.map((other) =>
          other.id === stage.id ? { type: input.type } : { type: other.type },
        ),
      );
    }
    const updated = await tx.stage.update({ where: { id: stage.id }, data: input });
    await recordAudit(tx, ctx, {
      action: "stage.updated",
      entityType: "stage",
      entityId: stage.id,
      changes: {
        name: { from: stage.name, to: updated.name },
        probability: { from: stage.probability, to: updated.probability },
        type: { from: stage.type, to: updated.type },
      },
    });
    return updated;
  });
}

export async function deleteStage(ctx: Ctx, stageId: string): Promise<void> {
  assertCan(ctx, "settings:manage");
  await db.$transaction(async (tx) => {
    const stage = notFoundUnless(
      await tx.stage.findFirst({
        where: { id: stageId, workspaceId: ctx.workspaceId },
        include: { pipeline: { include: { stages: true } }, _count: { select: { deals: true } } },
      }),
      "Stage",
    );
    if (stage._count.deals > 0) {
      throw new ConflictError("Move this stage's deals to another stage before deleting it.");
    }
    assertStageSetComplete(stage.pipeline.stages.filter((other) => other.id !== stage.id));
    await tx.stage.delete({ where: { id: stage.id } });
    const remaining = stage.pipeline.stages
      .filter((other) => other.id !== stage.id)
      .sort((a, b) => a.position - b.position);
    await Promise.all(
      remaining.map((other, index) =>
        tx.stage.update({ where: { id: other.id }, data: { position: index } }),
      ),
    );
    await recordAudit(tx, ctx, {
      action: "stage.deleted",
      entityType: "stage",
      entityId: stage.id,
      changes: { pipeline: stage.pipeline.name, name: stage.name },
    });
  });
}

/** Replaces the stage order of a pipeline. `stageIds` must list every stage exactly once. */
export async function reorderStages(ctx: Ctx, pipelineId: string, stageIds: readonly string[]) {
  assertCan(ctx, "settings:manage");
  return db.$transaction(async (tx) => {
    const pipeline = await getPipeline(tx, ctx, pipelineId);
    const current = pipeline.stages.map((stage) => stage.id);
    const sameSet =
      stageIds.length === current.length &&
      new Set(stageIds).size === stageIds.length &&
      stageIds.every((id) => current.includes(id));
    if (!sameSet) throw new ValidationError("The new order must include every stage once.");
    await Promise.all(
      stageIds.map((id, position) => tx.stage.update({ where: { id }, data: { position } })),
    );
    await recordAudit(tx, ctx, {
      action: "pipeline.stages_reordered",
      entityType: "pipeline",
      entityId: pipeline.id,
      changes: {
        order: {
          from: pipeline.stages.map((stage) => stage.name),
          to: stageIds.map((id) => pipeline.stages.find((stage) => stage.id === id)?.name),
        },
      },
    });
  });
}

/** Moves one stage up or down by one place. */
export async function shiftStage(ctx: Ctx, stageId: string, direction: "up" | "down") {
  assertCan(ctx, "settings:manage");
  const stage = notFoundUnless(
    await db.stage.findFirst({ where: { id: stageId, workspaceId: ctx.workspaceId } }),
    "Stage",
  );
  const siblings = await db.stage.findMany({
    where: { pipelineId: stage.pipelineId },
    orderBy: { position: "asc" },
    select: { id: true },
  });
  const ids = siblings.map((sibling) => sibling.id);
  const index = ids.indexOf(stage.id);
  const target = direction === "up" ? index - 1 : index + 1;
  if (target < 0 || target >= ids.length) return;
  [ids[index], ids[target]] = [ids[target] as string, ids[index] as string];
  await reorderStages(ctx, stage.pipelineId, ids);
}
