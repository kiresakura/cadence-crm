import { z } from "zod";

import type { Prisma } from "@/generated/prisma/client";
import { LifecycleStage } from "@/generated/prisma/enums";
import { fullName } from "@/lib/format";

import { diffFields, recordAudit } from "../audit";
import { db, type DbClient } from "../db";
import { validateCustomFieldValues } from "../domain/custom-fields";
import { normalizePhone } from "../domain/phone";
import { parseInput } from "../errors";
import { assertCan, type Ctx } from "../permissions";
import { contactSchema, type ContactInput } from "../validation/schemas";
import { deleteOnlyLinked } from "./deletion";
import {
  asJsonObject,
  assertCompanyRef,
  assertMemberRef,
  assertTagRefs,
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

export const CONTACT_SORTS = [
  "name",
  "-name",
  "created",
  "-created",
  "updated",
  "-updated",
] as const;

export const contactFiltersSchema = z.object({
  q: z.string().trim().max(100).optional().catch(undefined),
  owner: z.string().trim().max(64).optional().catch(undefined),
  lifecycle: z.enum(LifecycleStage).optional().catch(undefined),
  tag: z.string().trim().max(64).optional().catch(undefined),
  sort: z.enum(CONTACT_SORTS).default("-created").catch("-created"),
  page: z.coerce.number().int().min(1).max(10_000).default(1).catch(1),
  pageSize: z.coerce.number().int().min(5).max(100).default(25).catch(25),
});
export type ContactFilters = z.output<typeof contactFiltersSchema>;

export function parseContactFilters(input: SearchParamsInput): ContactFilters {
  return contactFiltersSchema.parse(searchParamsToObject(input));
}

const AUDITED_FIELDS = [
  "firstName",
  "lastName",
  "email",
  "phone",
  "jobTitle",
  "companyId",
  "ownerId",
  "lifecycleStage",
  "source",
  "customFields",
] as const;

function contactWhere(ctx: Ctx, filters: ContactFilters): Prisma.ContactWhereInput {
  const and: Prisma.ContactWhereInput[] = searchTerms(filters.q).map((term) => ({
    OR: [
      { firstName: { contains: term, mode: "insensitive" } },
      { lastName: { contains: term, mode: "insensitive" } },
      { email: { contains: term, mode: "insensitive" } },
      { phone: { contains: term } },
      { company: { name: { contains: term, mode: "insensitive" } } },
    ],
  }));
  if (filters.owner === "me") and.push({ ownerId: ctx.userId });
  else if (filters.owner === "none") and.push({ ownerId: null });
  else if (filters.owner) and.push({ ownerId: filters.owner });
  if (filters.lifecycle) and.push({ lifecycleStage: filters.lifecycle });
  if (filters.tag) and.push({ tags: { some: { tagId: filters.tag } } });
  return { workspaceId: ctx.workspaceId, AND: and };
}

function contactOrder(sort: ContactFilters["sort"]): Prisma.ContactOrderByWithRelationInput[] {
  const direction = sort.startsWith("-") ? "desc" : "asc";
  switch (sort.replace("-", "")) {
    case "name":
      return [{ lastName: direction }, { firstName: direction }, { id: "asc" }];
    case "updated":
      return [{ updatedAt: direction }, { id: "asc" }];
    default:
      return [{ createdAt: direction }, { id: "asc" }];
  }
}

const listInclude = {
  company: { select: { id: true, name: true } },
  owner: { select: { id: true, name: true } },
  tags: { include: { tag: true }, orderBy: { tag: { name: "asc" } } },
} satisfies Prisma.ContactInclude;

export async function listContacts(ctx: Ctx, filters: ContactFilters) {
  assertCan(ctx, "records:read");
  const where = contactWhere(ctx, filters);
  const [total, items] = await Promise.all([
    db.contact.count({ where }),
    db.contact.findMany({
      where,
      include: listInclude,
      orderBy: contactOrder(filters.sort),
      skip: (filters.page - 1) * filters.pageSize,
      take: filters.pageSize,
    }),
  ]);
  return pageOf(items, total, filters.page, filters.pageSize);
}

export async function listContactsForExport(ctx: Ctx, filters: ContactFilters) {
  assertCan(ctx, "records:read");
  return db.contact.findMany({
    where: contactWhere(ctx, filters),
    include: listInclude,
    orderBy: contactOrder(filters.sort),
    take: EXPORT_LIMIT,
  });
}

export async function getContact(ctx: Ctx, id: string) {
  assertCan(ctx, "records:read");
  const contact = await db.contact.findFirst({
    where: { id, workspaceId: ctx.workspaceId },
    include: {
      company: { select: { id: true, name: true, domain: true } },
      owner: { select: { id: true, name: true } },
      tags: { include: { tag: true }, orderBy: { tag: { name: "asc" } } },
      deals: {
        include: { stage: true, pipeline: { select: { id: true, name: true } } },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  return notFoundUnless(contact, "Contact");
}

async function buildContactData(
  tx: DbClient,
  ctx: Ctx,
  input: ContactInput,
  existing?: { ownerId: string | null; customFields: unknown },
) {
  await assertCompanyRef(tx, ctx, input.companyId);
  // Someone who left the workspace stays the owner until another owner is chosen.
  if (input.ownerId !== existing?.ownerId) {
    await assertMemberRef(tx, ctx, input.ownerId, "ownerId");
  }
  await assertTagRefs(tx, ctx, input.tagIds);
  const definitions = await loadFieldDefinitions(tx, ctx, "CONTACT");
  const customFields = validateCustomFieldValues(
    definitions,
    input.customFields,
    existing ? asJsonObject(existing.customFields) : undefined,
  );
  return {
    firstName: input.firstName,
    lastName: input.lastName,
    email: input.email,
    phone: input.phone,
    phoneNormalized: normalizePhone(input.phone),
    jobTitle: input.jobTitle,
    companyId: input.companyId,
    ownerId: input.ownerId,
    lifecycleStage: input.lifecycleStage,
    source: input.source,
    customFields,
  };
}

export async function createContact(ctx: Ctx, rawInput: unknown) {
  assertCan(ctx, "records:write");
  const input = parseInput(contactSchema, rawInput);
  return db.$transaction(async (tx) => {
    const data = await buildContactData(tx, ctx, input);
    const contact = await tx.contact.create({
      data: {
        ...data,
        workspaceId: ctx.workspaceId,
        tags: { create: input.tagIds.map((tagId) => ({ tagId })) },
      },
    });
    await recordAudit(tx, ctx, {
      action: "contact.created",
      entityType: "contact",
      entityId: contact.id,
      changes: { name: fullName(contact), email: contact.email },
    });
    return contact;
  });
}

export async function updateContact(ctx: Ctx, id: string, rawInput: unknown) {
  assertCan(ctx, "records:write");
  const input = parseInput(contactSchema, rawInput);
  return db.$transaction(async (tx) => {
    const existing = notFoundUnless(
      await tx.contact.findFirst({
        where: { id, workspaceId: ctx.workspaceId },
        include: { tags: { select: { tagId: true } } },
      }),
      "Contact",
    );
    const data = await buildContactData(tx, ctx, input, existing);
    const updated = await tx.contact.update({
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
        action: "contact.updated",
        entityType: "contact",
        entityId: updated.id,
        changes,
      });
    }
    return updated;
  });
}

export async function deleteContact(ctx: Ctx, id: string): Promise<void> {
  assertCan(ctx, "records:write");
  await db.$transaction(async (tx) => {
    const existing = notFoundUnless(
      await tx.contact.findFirst({ where: { id, workspaceId: ctx.workspaceId } }),
      "Contact",
    );
    const removed = await deleteOnlyLinked(tx, ctx, "contact", existing.id);
    await tx.contact.delete({ where: { id: existing.id } });
    await recordAudit(tx, ctx, {
      action: "contact.deleted",
      entityType: "contact",
      entityId: existing.id,
      changes: { name: fullName(existing), email: existing.email, removed },
    });
  });
}

/** Shape the edit form and the JSON API use to round-trip a contact. */
export function contactToInput(contact: Awaited<ReturnType<typeof getContact>>) {
  return {
    firstName: contact.firstName,
    lastName: contact.lastName,
    email: contact.email,
    phone: contact.phone,
    jobTitle: contact.jobTitle,
    companyId: contact.companyId,
    ownerId: contact.ownerId,
    lifecycleStage: contact.lifecycleStage,
    source: contact.source,
    tagIds: contact.tags.map((tag) => tag.tagId),
    customFields: asJsonObject(contact.customFields),
  };
}
