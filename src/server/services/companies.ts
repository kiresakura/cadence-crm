import { z } from "zod";

import type { Prisma } from "@/generated/prisma/client";

import { diffFields, recordAudit } from "../audit";
import { db, type DbClient } from "../db";
import { validateCustomFieldValues } from "../domain/custom-fields";
import { parseInput } from "../errors";
import { assertCan, type Ctx } from "../permissions";
import { companySchema, type CompanyInput } from "../validation/schemas";
import {
  asJsonObject,
  assertMemberRef,
  assertTagRefs,
  loadFieldDefinitions,
  notFoundUnless,
} from "./guards";
import { pageOf, searchParamsToObject, searchTerms, type SearchParamsInput } from "./query";

export const COMPANY_SORTS = ["name", "-name", "created", "-created"] as const;

export const companyFiltersSchema = z.object({
  q: z.string().trim().max(100).optional().catch(undefined),
  owner: z.string().trim().max(64).optional().catch(undefined),
  tag: z.string().trim().max(64).optional().catch(undefined),
  sort: z.enum(COMPANY_SORTS).default("name").catch("name"),
  page: z.coerce.number().int().min(1).max(10_000).default(1).catch(1),
  pageSize: z.coerce.number().int().min(5).max(100).default(25).catch(25),
});
export type CompanyFilters = z.output<typeof companyFiltersSchema>;

export function parseCompanyFilters(input: SearchParamsInput): CompanyFilters {
  return companyFiltersSchema.parse(searchParamsToObject(input));
}

const AUDITED_FIELDS = [
  "name",
  "domain",
  "industry",
  "size",
  "phone",
  "address",
  "ownerId",
  "customFields",
] as const;

function companyWhere(ctx: Ctx, filters: CompanyFilters): Prisma.CompanyWhereInput {
  const and: Prisma.CompanyWhereInput[] = searchTerms(filters.q).map((term) => ({
    OR: [
      { name: { contains: term, mode: "insensitive" } },
      { domain: { contains: term, mode: "insensitive" } },
      { industry: { contains: term, mode: "insensitive" } },
    ],
  }));
  if (filters.owner === "me") and.push({ ownerId: ctx.userId });
  else if (filters.owner === "none") and.push({ ownerId: null });
  else if (filters.owner) and.push({ ownerId: filters.owner });
  if (filters.tag) and.push({ tags: { some: { tagId: filters.tag } } });
  return { workspaceId: ctx.workspaceId, AND: and };
}

export async function listCompanies(ctx: Ctx, filters: CompanyFilters) {
  assertCan(ctx, "records:read");
  const where = companyWhere(ctx, filters);
  const direction = filters.sort.startsWith("-") ? "desc" : "asc";
  const orderBy: Prisma.CompanyOrderByWithRelationInput[] = filters.sort.includes("name")
    ? [{ name: direction }, { id: "asc" }]
    : [{ createdAt: direction }, { id: "asc" }];
  const [total, items] = await Promise.all([
    db.company.count({ where }),
    db.company.findMany({
      where,
      orderBy,
      skip: (filters.page - 1) * filters.pageSize,
      take: filters.pageSize,
      include: {
        owner: { select: { id: true, name: true } },
        tags: { include: { tag: true }, orderBy: { tag: { name: "asc" } } },
        _count: { select: { contacts: true, deals: true } },
      },
    }),
  ]);
  return pageOf(items, total, filters.page, filters.pageSize);
}

export async function getCompany(ctx: Ctx, id: string) {
  assertCan(ctx, "records:read");
  const company = await db.company.findFirst({
    where: { id, workspaceId: ctx.workspaceId },
    include: {
      owner: { select: { id: true, name: true } },
      tags: { include: { tag: true }, orderBy: { tag: { name: "asc" } } },
      contacts: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          jobTitle: true,
          lifecycleStage: true,
        },
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      },
      deals: {
        include: { stage: true, pipeline: { select: { id: true, name: true } } },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  return notFoundUnless(company, "Company");
}

async function buildCompanyData(
  tx: DbClient,
  ctx: Ctx,
  input: CompanyInput,
  existingCustomFields: Record<string, unknown> = {},
) {
  await assertMemberRef(tx, ctx, input.ownerId, "ownerId");
  await assertTagRefs(tx, ctx, input.tagIds);
  const definitions = await loadFieldDefinitions(tx, ctx, "COMPANY");
  return {
    name: input.name,
    domain: input.domain?.toLowerCase() ?? null,
    industry: input.industry,
    size: input.size,
    phone: input.phone,
    address: input.address,
    ownerId: input.ownerId,
    customFields: validateCustomFieldValues(definitions, input.customFields, existingCustomFields),
  };
}

export async function createCompany(ctx: Ctx, rawInput: unknown) {
  assertCan(ctx, "records:write");
  const input = parseInput(companySchema, rawInput);
  return db.$transaction(async (tx) => {
    const data = await buildCompanyData(tx, ctx, input);
    const company = await tx.company.create({
      data: {
        ...data,
        workspaceId: ctx.workspaceId,
        tags: { create: input.tagIds.map((tagId) => ({ tagId })) },
      },
    });
    await recordAudit(tx, ctx, {
      action: "company.created",
      entityType: "company",
      entityId: company.id,
      changes: { name: company.name },
    });
    return company;
  });
}

export async function updateCompany(ctx: Ctx, id: string, rawInput: unknown) {
  assertCan(ctx, "records:write");
  const input = parseInput(companySchema, rawInput);
  return db.$transaction(async (tx) => {
    const existing = notFoundUnless(
      await tx.company.findFirst({
        where: { id, workspaceId: ctx.workspaceId },
        include: { tags: { select: { tagId: true } } },
      }),
      "Company",
    );
    const data = await buildCompanyData(tx, ctx, input, asJsonObject(existing.customFields));
    const updated = await tx.company.update({
      where: { id: existing.id },
      data: {
        ...data,
        tags: { deleteMany: {}, create: input.tagIds.map((tagId) => ({ tagId })) },
      },
    });
    const changes: Record<string, unknown> = diffFields(existing, updated, AUDITED_FIELDS) ?? {};
    const before = existing.tags.map((tag) => tag.tagId).sort();
    const after = [...input.tagIds].sort();
    if (before.join() !== after.join()) changes.tagIds = { from: before, to: after };
    if (Object.keys(changes).length > 0) {
      await recordAudit(tx, ctx, {
        action: "company.updated",
        entityType: "company",
        entityId: updated.id,
        changes,
      });
    }
    return updated;
  });
}

export async function deleteCompany(ctx: Ctx, id: string): Promise<void> {
  assertCan(ctx, "records:write");
  await db.$transaction(async (tx) => {
    const existing = notFoundUnless(
      await tx.company.findFirst({ where: { id, workspaceId: ctx.workspaceId } }),
      "Company",
    );
    // Contacts, deals, activities and tasks keep existing; their company link is cleared.
    await tx.company.delete({ where: { id: existing.id } });
    await recordAudit(tx, ctx, {
      action: "company.deleted",
      entityType: "company",
      entityId: existing.id,
      changes: { name: existing.name },
    });
  });
}

export function companyToInput(company: Awaited<ReturnType<typeof getCompany>>) {
  return {
    name: company.name,
    domain: company.domain,
    industry: company.industry,
    size: company.size,
    phone: company.phone,
    address: company.address,
    ownerId: company.ownerId,
    tagIds: company.tags.map((tag) => tag.tagId),
    customFields: asJsonObject(company.customFields),
  };
}
