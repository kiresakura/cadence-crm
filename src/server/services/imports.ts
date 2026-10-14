import { randomUUID } from "node:crypto";

import { z } from "zod";

import { LifecycleStage } from "@/generated/prisma/enums";

import { recordAudit } from "../audit";
import { db, type DbClient } from "../db";
import {
  applyMapping,
  isImportFieldKey,
  parseCsv,
  splitFullName,
  suggestMapping,
  type ColumnMapping,
  type ImportFieldKey,
  type MappedRow,
} from "../domain/csv";
import { normalizePhone } from "../domain/phone";
import { ValidationError, zodFieldErrors } from "../errors";
import { assertCan, type Ctx } from "../permissions";
import { optionalEmail, optionalText, requiredText } from "../validation/common";

const importRowSchema = z.object({
  firstName: requiredText("First name", 100),
  lastName: requiredText("Last name", 100),
  email: optionalEmail,
  phone: optionalText(50),
  jobTitle: optionalText(120),
  companyName: optionalText(160),
  lifecycleStage: z
    .string()
    .trim()
    .toUpperCase()
    .optional()
    .transform((value) => (value ? value : "LEAD"))
    .pipe(
      z.enum(LifecycleStage, {
        error: "Lifecycle stage must be Lead, Prospect, Customer or Churned.",
      }),
    ),
  source: optionalText(80),
  tags: z
    .string()
    .optional()
    .transform((value) =>
      (value ?? "")
        .split(/[;,|]/)
        .map((tag) => tag.trim())
        .filter(Boolean),
    ),
});
type ImportRow = z.output<typeof importRowSchema>;

export type ImportRowResult =
  | { rowNumber: number; status: "ready"; data: ImportRow }
  | { rowNumber: number; status: "duplicate"; email: string; reason: string }
  | { rowNumber: number; status: "error"; messages: string[] };

export interface ImportAnalysis {
  headers: string[];
  mapping: ColumnMapping;
  rows: ImportRowResult[];
  summary: { total: number; ready: number; duplicates: number; errors: number };
  unknownTags: string[];
}

export function sanitizeMapping(headers: readonly string[], mapping: unknown): ColumnMapping {
  const input = mapping && typeof mapping === "object" ? (mapping as Record<string, unknown>) : {};
  const result: ColumnMapping = {};
  const used = new Set<ImportFieldKey>();
  for (const header of headers) {
    const value = input[header];
    if (typeof value === "string" && isImportFieldKey(value) && !used.has(value)) {
      result[header] = value;
      used.add(value);
    } else {
      result[header] = null;
    }
  }
  return result;
}

function rowCandidate(row: MappedRow) {
  const values = { ...row.values };
  if (values.fullName && !values.firstName && !values.lastName) {
    const { firstName, lastName } = splitFullName(values.fullName);
    values.firstName = firstName;
    values.lastName = lastName;
  }
  delete values.fullName;
  return values;
}

async function analyze(
  tx: DbClient,
  ctx: Ctx,
  text: string,
  requestedMapping?: unknown,
): Promise<ImportAnalysis> {
  const { headers, rows } = parseCsv(text);
  const mapping = requestedMapping
    ? sanitizeMapping(headers, requestedMapping)
    : suggestMapping(headers);
  const mapped = applyMapping(rows, mapping);

  const mappedFields = new Set(Object.values(mapping));
  const hasName =
    (mappedFields.has("firstName") && mappedFields.has("lastName")) || mappedFields.has("fullName");
  if (!hasName) {
    throw new ValidationError("Map a first and last name column, or a full name column.");
  }

  const emails = mapped
    .map((row) => row.values.email?.trim().toLowerCase())
    .filter((email): email is string => Boolean(email));
  const existing = new Set(
    (
      await tx.contact.findMany({
        where: { workspaceId: ctx.workspaceId, email: { in: emails } },
        select: { email: true },
      })
    ).map((contact) => contact.email),
  );
  const tags = await tx.tag.findMany({
    where: { workspaceId: ctx.workspaceId },
    select: { name: true },
  });
  const knownTags = new Set(tags.map((tag) => tag.name.toLowerCase()));
  const unknownTags = new Set<string>();

  const seen = new Set<string>();
  const results: ImportRowResult[] = mapped.map((row) => {
    const parsed = importRowSchema.safeParse(rowCandidate(row));
    if (!parsed.success) {
      const messages = Object.values(zodFieldErrors(parsed.error)).flat();
      return { rowNumber: row.rowNumber, status: "error", messages };
    }
    const email = parsed.data.email;
    if (email) {
      if (existing.has(email)) {
        return {
          rowNumber: row.rowNumber,
          status: "duplicate",
          email,
          reason: "A contact with this email already exists.",
        };
      }
      if (seen.has(email)) {
        return {
          rowNumber: row.rowNumber,
          status: "duplicate",
          email,
          reason: "This email appears earlier in the file.",
        };
      }
      seen.add(email);
    }
    for (const tag of parsed.data.tags) {
      if (!knownTags.has(tag.toLowerCase())) unknownTags.add(tag);
    }
    return { rowNumber: row.rowNumber, status: "ready", data: parsed.data };
  });

  return {
    headers,
    mapping,
    rows: results,
    summary: {
      total: results.length,
      ready: results.filter((row) => row.status === "ready").length,
      duplicates: results.filter((row) => row.status === "duplicate").length,
      errors: results.filter((row) => row.status === "error").length,
    },
    unknownTags: [...unknownTags].sort(),
  };
}

/** Parses the file and reports what an import would do, without writing anything. */
export async function previewContactImport(ctx: Ctx, text: string, mapping?: unknown) {
  assertCan(ctx, "records:write");
  return analyze(db, ctx, text, mapping);
}

/**
 * Imports contacts from CSV. Rows whose email already exists (in the workspace or earlier in
 * the file) are skipped, invalid rows are reported with their row number, companies are
 * matched by name or created, and only existing tags are applied.
 */
export async function importContacts(ctx: Ctx, text: string, mapping?: unknown) {
  assertCan(ctx, "records:write");
  return db.$transaction(
    async (tx) => {
      const analysis = await analyze(tx, ctx, text, mapping);
      const ready = analysis.rows.filter(
        (row): row is Extract<ImportRowResult, { status: "ready" }> => row.status === "ready",
      );

      const companyNames = [
        ...new Set(ready.map((row) => row.data.companyName).filter(Boolean)),
      ] as string[];
      const companies = await tx.company.findMany({
        where: {
          workspaceId: ctx.workspaceId,
          name: { in: companyNames, mode: "insensitive" },
        },
        select: { id: true, name: true },
      });
      const companyIds = new Map(
        companies.map((company) => [company.name.toLowerCase(), company.id]),
      );
      for (const name of companyNames) {
        if (companyIds.has(name.toLowerCase())) continue;
        const company = await tx.company.create({ data: { workspaceId: ctx.workspaceId, name } });
        companyIds.set(name.toLowerCase(), company.id);
      }

      const tags = await tx.tag.findMany({
        where: { workspaceId: ctx.workspaceId },
        select: { id: true, name: true },
      });
      const tagIds = new Map(tags.map((tag) => [tag.name.toLowerCase(), tag.id]));

      const created = await tx.contact.createManyAndReturn({
        data: ready.map((row) => ({
          workspaceId: ctx.workspaceId,
          firstName: row.data.firstName,
          lastName: row.data.lastName,
          email: row.data.email,
          phone: row.data.phone,
          phoneNormalized: normalizePhone(row.data.phone),
          jobTitle: row.data.jobTitle,
          companyId: row.data.companyName
            ? (companyIds.get(row.data.companyName.toLowerCase()) ?? null)
            : null,
          lifecycleStage: row.data.lifecycleStage,
          source: row.data.source ?? "CSV import",
          ownerId: ctx.userId,
        })),
        select: { id: true },
      });

      const links = created.flatMap((contact, index) =>
        (ready[index]?.data.tags ?? [])
          .map((name) => tagIds.get(name.toLowerCase()))
          .filter((tagId): tagId is string => Boolean(tagId))
          .map((tagId) => ({ contactId: contact.id, tagId })),
      );
      if (links.length > 0) await tx.contactTag.createMany({ data: links, skipDuplicates: true });

      await recordAudit(tx, ctx, {
        action: "contact.imported",
        entityType: "contact",
        entityId: randomUUID(),
        changes: { ...analysis.summary, created: created.length },
      });

      return { ...analysis, created: created.length };
    },
    { timeout: 30_000 },
  );
}
