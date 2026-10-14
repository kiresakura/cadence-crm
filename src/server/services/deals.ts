import { z } from "zod";

import type { Prisma } from "@/generated/prisma/client";
import type { StageType } from "@/generated/prisma/enums";

import { diffFields, recordAudit } from "../audit";
import { db, type DbClient } from "../db";
import { validateCustomFieldValues } from "../domain/custom-fields";
import { resolveStageTransition } from "../domain/deal-stage";
import { ValidationError, parseInput } from "../errors";
import { assertCan, type Ctx } from "../permissions";
import { dateOnlyToDate, dateToDateOnly } from "../validation/common";
import { dealSchema, moveDealSchema, type DealInput } from "../validation/schemas";
import {
  asJsonObject,
  assertCompanyRef,
  assertContactRef,
  assertMemberRef,
  loadFieldDefinitions,
  notFoundUnless,
} from "./guards";
import {
  EXPORT_LIMIT,
  pageOf,
  searchParamsToObject,
  searchTerms,
  type SearchParamsInput,
} from "./query";

export const DEAL_SORTS = ["created", "-created", "amount", "-amount", "close", "-close"] as const;

export const dealFiltersSchema = z.object({
  q: z.string().trim().max(100).optional().catch(undefined),
  pipeline: z.string().trim().max(64).optional().catch(undefined),
  owner: z.string().trim().max(64).optional().catch(undefined),
  status: z.enum(["open", "won", "lost"]).optional().catch(undefined),
  sort: z.enum(DEAL_SORTS).default("-created").catch("-created"),
  page: z.coerce.number().int().min(1).max(10_000).default(1).catch(1),
  pageSize: z.coerce.number().int().min(5).max(100).default(25).catch(25),
});
export type DealFilters = z.output<typeof dealFiltersSchema>;

export function parseDealFilters(input: SearchParamsInput): DealFilters {
  return dealFiltersSchema.parse(searchParamsToObject(input));
}

const AUDITED_FIELDS = [
  "title",
  "amount",
  "currency",
  "pipelineId",
  "stageId",
  "companyId",
  "primaryContactId",
  "ownerId",
  "expectedCloseDate",
  "closedAt",
  "lostReason",
  "customFields",
] as const;

const STATUS_TO_TYPE: Record<NonNullable<DealFilters["status"]>, StageType> = {
  open: "OPEN",
  won: "WON",
  lost: "LOST",
};

function dealWhere(ctx: Ctx, filters: DealFilters): Prisma.DealWhereInput {
  const and: Prisma.DealWhereInput[] = searchTerms(filters.q).map((term) => ({
    OR: [
      { title: { contains: term, mode: "insensitive" } },
      { company: { name: { contains: term, mode: "insensitive" } } },
    ],
  }));
  if (filters.pipeline) and.push({ pipelineId: filters.pipeline });
  if (filters.owner === "me") and.push({ ownerId: ctx.userId });
  else if (filters.owner === "none") and.push({ ownerId: null });
  else if (filters.owner) and.push({ ownerId: filters.owner });
  if (filters.status) and.push({ stage: { type: STATUS_TO_TYPE[filters.status] } });
  return { workspaceId: ctx.workspaceId, AND: and };
}

function dealOrder(sort: DealFilters["sort"]): Prisma.DealOrderByWithRelationInput[] {
  const direction = sort.startsWith("-") ? "desc" : "asc";
  switch (sort.replace("-", "")) {
    case "amount":
      return [{ amount: direction }, { id: "asc" }];
    case "close":
      return [{ expectedCloseDate: { sort: direction, nulls: "last" } }, { id: "asc" }];
    default:
      return [{ createdAt: direction }, { id: "asc" }];
  }
}

const dealInclude = {
  stage: true,
  pipeline: { select: { id: true, name: true } },
  company: { select: { id: true, name: true } },
  primaryContact: { select: { id: true, firstName: true, lastName: true } },
  owner: { select: { id: true, name: true } },
} satisfies Prisma.DealInclude;

export async function listDeals(ctx: Ctx, filters: DealFilters) {
  assertCan(ctx, "records:read");
  const where = dealWhere(ctx, filters);
  const [total, items] = await Promise.all([
    db.deal.count({ where }),
    db.deal.findMany({
      where,
      include: dealInclude,
      orderBy: dealOrder(filters.sort),
      skip: (filters.page - 1) * filters.pageSize,
      take: filters.pageSize,
    }),
  ]);
  return pageOf(items, total, filters.page, filters.pageSize);
}

export async function listDealsForExport(ctx: Ctx, filters: DealFilters) {
  assertCan(ctx, "records:read");
  return db.deal.findMany({
    where: dealWhere(ctx, filters),
    include: dealInclude,
    orderBy: dealOrder(filters.sort),
    take: EXPORT_LIMIT,
  });
}

/** Pipelines plus the selected pipeline's stages and deals, for the kanban board. */
export async function getBoard(ctx: Ctx, pipelineId?: string) {
  assertCan(ctx, "records:read");
  const pipelines = await db.pipeline.findMany({
    where: { workspaceId: ctx.workspaceId },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    select: { id: true, name: true },
  });
  const selected = pipelines.find((pipeline) => pipeline.id === pipelineId) ?? pipelines[0];
  if (!selected) return { pipelines, pipeline: null, stages: [], deals: [] };
  const [stages, deals] = await Promise.all([
    db.stage.findMany({
      where: { workspaceId: ctx.workspaceId, pipelineId: selected.id },
      orderBy: { position: "asc" },
    }),
    db.deal.findMany({
      where: { workspaceId: ctx.workspaceId, pipelineId: selected.id },
      include: dealInclude,
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
    }),
  ]);
  return { pipelines, pipeline: selected, stages, deals };
}

export async function getDeal(ctx: Ctx, id: string) {
  assertCan(ctx, "records:read");
  const deal = await db.deal.findFirst({
    where: { id, workspaceId: ctx.workspaceId },
    include: {
      ...dealInclude,
      pipeline: {
        select: { id: true, name: true, stages: { orderBy: { position: "asc" } } },
      },
    },
  });
  return notFoundUnless(deal, "Deal");
}

async function findStage(tx: DbClient, ctx: Ctx, stageId: string) {
  return tx.stage.findFirst({ where: { id: stageId, workspaceId: ctx.workspaceId } });
}

async function buildDealData(
  tx: DbClient,
  ctx: Ctx,
  input: DealInput,
  current: { type: StageType; closedAt: Date | null } | null,
  existingCustomFields: Record<string, unknown> = {},
  now = new Date(),
) {
  const stage = await findStage(tx, ctx, input.stageId);
  if (!stage || stage.pipelineId !== input.pipelineId) {
    throw ValidationError.forField("stageId", "Choose a stage from the selected pipeline.");
  }
  await assertCompanyRef(tx, ctx, input.companyId);
  await assertContactRef(tx, ctx, input.primaryContactId, "primaryContactId");
  await assertMemberRef(tx, ctx, input.ownerId, "ownerId");
  const definitions = await loadFieldDefinitions(tx, ctx, "DEAL");
  const customFields = validateCustomFieldValues(
    definitions,
    input.customFields,
    existingCustomFields,
  );
  const transition = resolveStageTransition(stage, current, input.lostReason, now);
  return {
    stage,
    data: {
      title: input.title,
      amount: input.amount,
      currency: input.currency,
      pipelineId: input.pipelineId,
      stageId: stage.id,
      companyId: input.companyId,
      primaryContactId: input.primaryContactId,
      ownerId: input.ownerId,
      expectedCloseDate: dateOnlyToDate(input.expectedCloseDate),
      closedAt: transition.closedAt,
      lostReason: transition.lostReason,
      customFields,
    },
  };
}

export async function createDeal(ctx: Ctx, rawInput: unknown) {
  assertCan(ctx, "records:write");
  const input = parseInput(dealSchema, rawInput);
  return db.$transaction(async (tx) => {
    const { data } = await buildDealData(tx, ctx, input, null);
    const deal = await tx.deal.create({ data: { ...data, workspaceId: ctx.workspaceId } });
    await recordAudit(tx, ctx, {
      action: "deal.created",
      entityType: "deal",
      entityId: deal.id,
      changes: { title: deal.title, amount: deal.amount, currency: deal.currency },
    });
    return deal;
  });
}

export async function updateDeal(ctx: Ctx, id: string, rawInput: unknown) {
  assertCan(ctx, "records:write");
  const input = parseInput(dealSchema, rawInput);
  return db.$transaction(async (tx) => {
    const existing = notFoundUnless(
      await tx.deal.findFirst({
        where: { id, workspaceId: ctx.workspaceId },
        include: { stage: true },
      }),
      "Deal",
    );
    const { data } = await buildDealData(
      tx,
      ctx,
      input,
      { type: existing.stage.type, closedAt: existing.closedAt },
      asJsonObject(existing.customFields),
    );
    const updated = await tx.deal.update({ where: { id: existing.id }, data });
    const changes = diffFields(existing, updated, AUDITED_FIELDS);
    if (changes) {
      await recordAudit(tx, ctx, {
        action: "deal.updated",
        entityType: "deal",
        entityId: updated.id,
        changes,
      });
    }
    return updated;
  });
}

/**
 * Moves a deal to another stage of its pipeline (kanban drag, won/lost buttons).
 * Entering a LOST stage requires a reason; WON/LOST set `closedAt`, OPEN clears it.
 */
export async function moveDeal(ctx: Ctx, id: string, rawInput: unknown) {
  assertCan(ctx, "records:write");
  const input = parseInput(moveDealSchema, rawInput);
  return db.$transaction(async (tx) => {
    const deal = notFoundUnless(
      await tx.deal.findFirst({
        where: { id, workspaceId: ctx.workspaceId },
        include: { stage: true },
      }),
      "Deal",
    );
    const stage = await findStage(tx, ctx, input.stageId);
    if (!stage) throw ValidationError.forField("stageId", "Stage not found.");
    if (stage.pipelineId !== deal.pipelineId) {
      throw ValidationError.forField(
        "stageId",
        "A deal can only move between stages of its own pipeline.",
      );
    }
    if (stage.id === deal.stageId && stage.type !== "LOST") return deal;

    const transition = resolveStageTransition(
      stage,
      { type: deal.stage.type, closedAt: deal.closedAt },
      input.lostReason,
      new Date(),
    );
    const updated = await tx.deal.update({
      where: { id: deal.id },
      data: { stageId: stage.id, ...transition },
      include: { stage: true },
    });
    await recordAudit(tx, ctx, {
      action: "deal.stage_changed",
      entityType: "deal",
      entityId: deal.id,
      changes: {
        stage: { from: deal.stage.name, to: stage.name },
        ...(transition.lostReason ? { lostReason: transition.lostReason } : {}),
      },
    });
    return updated;
  });
}

/** Marks a deal won or lost by moving it to the first stage of that type in its pipeline. */
export async function closeDeal(
  ctx: Ctx,
  id: string,
  outcome: "WON" | "LOST",
  lostReason?: string | null,
) {
  assertCan(ctx, "records:write");
  const deal = notFoundUnless(
    await db.deal.findFirst({ where: { id, workspaceId: ctx.workspaceId } }),
    "Deal",
  );
  const stage = await db.stage.findFirst({
    where: { workspaceId: ctx.workspaceId, pipelineId: deal.pipelineId, type: outcome },
    orderBy: { position: "asc" },
  });
  if (!stage) throw new ValidationError(`This pipeline has no ${outcome.toLowerCase()} stage.`);
  return moveDeal(ctx, id, { stageId: stage.id, lostReason });
}

export async function deleteDeal(ctx: Ctx, id: string): Promise<void> {
  assertCan(ctx, "records:write");
  await db.$transaction(async (tx) => {
    const existing = notFoundUnless(
      await tx.deal.findFirst({ where: { id, workspaceId: ctx.workspaceId } }),
      "Deal",
    );
    await tx.deal.delete({ where: { id: existing.id } });
    await recordAudit(tx, ctx, {
      action: "deal.deleted",
      entityType: "deal",
      entityId: existing.id,
      changes: { title: existing.title, amount: existing.amount },
    });
  });
}

export function dealToInput(deal: Awaited<ReturnType<typeof getDeal>>) {
  return {
    title: deal.title,
    amount: deal.amount.toFixed(2),
    currency: deal.currency,
    pipelineId: deal.pipelineId,
    stageId: deal.stageId,
    companyId: deal.companyId,
    primaryContactId: deal.primaryContactId,
    ownerId: deal.ownerId,
    expectedCloseDate: dateToDateOnly(deal.expectedCloseDate),
    lostReason: deal.lostReason,
    customFields: asJsonObject(deal.customFields),
  };
}
