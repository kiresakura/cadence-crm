import type { CustomFieldEntity } from "@/generated/prisma/enums";

import type { DbClient } from "../db";
import { NotFoundError, ValidationError } from "../errors";
import type { Ctx } from "../permissions";

// Every foreign id that arrives from a client is checked against the caller's workspace
// before it is written, so a record can never point into another tenant.

export async function assertMemberRef(
  db: DbClient,
  ctx: Ctx,
  userId: string | null | undefined,
  field: string,
): Promise<void> {
  if (!userId) return;
  const membership = await db.membership.findUnique({
    where: { workspaceId_userId: { workspaceId: ctx.workspaceId, userId } },
    select: { id: true },
  });
  if (!membership) throw ValidationError.forField(field, "Choose a member of this workspace.");
}

export async function assertCompanyRef(
  db: DbClient,
  ctx: Ctx,
  companyId: string | null | undefined,
  field = "companyId",
): Promise<void> {
  if (!companyId) return;
  const found = await db.company.findFirst({
    where: { id: companyId, workspaceId: ctx.workspaceId },
    select: { id: true },
  });
  if (!found) throw ValidationError.forField(field, "Company not found.");
}

export async function assertContactRef(
  db: DbClient,
  ctx: Ctx,
  contactId: string | null | undefined,
  field = "contactId",
): Promise<void> {
  if (!contactId) return;
  const found = await db.contact.findFirst({
    where: { id: contactId, workspaceId: ctx.workspaceId },
    select: { id: true },
  });
  if (!found) throw ValidationError.forField(field, "Contact not found.");
}

export async function assertDealRef(
  db: DbClient,
  ctx: Ctx,
  dealId: string | null | undefined,
  field = "dealId",
): Promise<void> {
  if (!dealId) return;
  const found = await db.deal.findFirst({
    where: { id: dealId, workspaceId: ctx.workspaceId },
    select: { id: true },
  });
  if (!found) throw ValidationError.forField(field, "Deal not found.");
}

export async function assertTagRefs(
  db: DbClient,
  ctx: Ctx,
  tagIds: readonly string[],
): Promise<void> {
  if (tagIds.length === 0) return;
  const count = await db.tag.count({
    where: { id: { in: [...tagIds] }, workspaceId: ctx.workspaceId },
  });
  if (count !== tagIds.length)
    throw ValidationError.forField("tagIds", "One or more tags were not found.");
}

export function loadFieldDefinitions(db: DbClient, ctx: Ctx, entityType: CustomFieldEntity) {
  return db.customFieldDefinition.findMany({
    where: { workspaceId: ctx.workspaceId, entityType },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
  });
}

export function asJsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function notFoundUnless<T>(value: T | null | undefined, entity: string): T {
  if (value === null || value === undefined) throw new NotFoundError(entity);
  return value;
}
