import { Prisma } from "@/generated/prisma/client";

import type { DbClient } from "./db";
import type { Ctx } from "./permissions";

export type AuditEntity =
  | "contact"
  | "company"
  | "deal"
  | "activity"
  | "task"
  | "pipeline"
  | "stage"
  | "tag"
  | "custom_field"
  | "member"
  | "invitation"
  | "workspace";

export interface AuditEntry {
  action: string;
  entityType: AuditEntity;
  entityId: string;
  changes?: Record<string, unknown> | null;
}

export type FieldChange = { from: unknown; to: unknown };

/** Converts values into stable JSON-friendly forms so diffs are comparable and storable. */
export function toAuditValue(value: unknown): unknown {
  if (value === undefined || value === null) return null;
  if (value instanceof Date) return value.toISOString();
  if (Prisma.Decimal.isDecimal(value)) return (value as Prisma.Decimal).toFixed(2);
  if (Array.isArray(value)) return value.map(toAuditValue);
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, toAuditValue(v)]),
    );
  }
  return value;
}

/** Field-level diff between two snapshots, limited to `keys`. Returns null when nothing changed. */
export function diffFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  keys: readonly string[],
): Record<string, FieldChange> | null {
  const changes: Record<string, FieldChange> = {};
  for (const key of keys) {
    const from = toAuditValue(before[key]);
    const to = toAuditValue(after[key]);
    if (JSON.stringify(from) !== JSON.stringify(to)) {
      changes[key] = { from, to };
    }
  }
  return Object.keys(changes).length > 0 ? changes : null;
}

export async function recordAudit(db: DbClient, ctx: Ctx, entry: AuditEntry): Promise<void> {
  await db.auditLog.create({
    data: {
      workspaceId: ctx.workspaceId,
      actorId: ctx.userId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      changes:
        entry.changes == null
          ? Prisma.JsonNull
          : (toAuditValue(entry.changes) as Prisma.InputJsonValue),
    },
  });
}
