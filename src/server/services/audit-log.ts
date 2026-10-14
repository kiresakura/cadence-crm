import { z } from "zod";

import { db } from "../db";
import { assertCan, type Ctx } from "../permissions";
import { pageOf, searchParamsToObject, type SearchParamsInput } from "./query";

export const AUDIT_ENTITY_FILTERS = [
  "contact",
  "company",
  "deal",
  "activity",
  "task",
  "pipeline",
  "stage",
  "tag",
  "custom_field",
  "member",
  "workspace",
] as const;

const auditFiltersSchema = z.object({
  entity: z.enum(AUDIT_ENTITY_FILTERS).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(10_000).default(1).catch(1),
});
export type AuditFilters = z.output<typeof auditFiltersSchema>;

export function parseAuditFilters(input: SearchParamsInput): AuditFilters {
  return auditFiltersSchema.parse(searchParamsToObject(input));
}

const PAGE_SIZE = 50;

export async function listAuditLogs(ctx: Ctx, filters: AuditFilters) {
  assertCan(ctx, "audit:read");
  const where = {
    workspaceId: ctx.workspaceId,
    ...(filters.entity ? { entityType: filters.entity } : {}),
  };
  const [total, items] = await Promise.all([
    db.auditLog.count({ where }),
    db.auditLog.findMany({
      where,
      include: { actor: { select: { id: true, name: true, email: true } } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (filters.page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);
  return pageOf(items, total, filters.page, PAGE_SIZE);
}
