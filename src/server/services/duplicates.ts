import { z } from "zod";

import type { Prisma } from "@/generated/prisma/client";
import { LIFECYCLE_LABELS, fullName } from "@/lib/format";

import { recordAudit } from "../audit";
import { db, type DbClient } from "../db";
import { ValidationError, parseInput } from "../errors";
import { assertCan, type Ctx } from "../permissions";
import { asJsonObject, loadFieldDefinitions, notFoundUnless } from "./guards";

export interface DuplicateCandidate {
  id: string;
  email: string | null;
  phoneNormalized: string | null;
}

export interface DuplicateGroup {
  /** `email:<address>` or `phone:<digits>`: the one value every member shares. */
  key: string;
  ids: string[];
  reasons: Array<"email" | "phone">;
}

/**
 * Groups contacts that share one email address (case-insensitive) or one normalised phone
 * number. Groups are not chained: if A and B share a phone and B and C share an email, A and
 * C are never in the same group, and B appears in both. People who share both an email and a
 * phone are shown once.
 */
export function groupDuplicates(contacts: readonly DuplicateCandidate[]): DuplicateGroup[] {
  const byKey = new Map<string, { reason: "email" | "phone"; ids: string[] }>();
  for (const contact of contacts) {
    const keys: Array<[string, "email" | "phone"]> = [];
    if (contact.email) keys.push([`email:${contact.email.toLowerCase()}`, "email"]);
    if (contact.phoneNormalized) keys.push([`phone:${contact.phoneNormalized}`, "phone"]);
    for (const [key, reason] of keys) {
      const group = byKey.get(key) ?? { reason, ids: [] };
      group.ids.push(contact.id);
      byKey.set(key, group);
    }
  }

  const groups = new Map<string, DuplicateGroup>();
  for (const [key, group] of [...byKey.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    if (group.ids.length < 2) continue;
    const members = [...group.ids].sort().join();
    const same = groups.get(members);
    if (same) same.reasons = [...new Set([...same.reasons, group.reason])].sort();
    else groups.set(members, { key, ids: group.ids, reasons: [group.reason] });
  }
  return [...groups.values()];
}

const contactSummarySelect = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  phone: true,
  jobTitle: true,
  createdAt: true,
  company: { select: { id: true, name: true } },
  _count: { select: { activities: true, tasks: true, deals: true } },
} satisfies Prisma.ContactSelect;

export async function findDuplicateGroups(ctx: Ctx) {
  assertCan(ctx, "records:read");
  const candidates = await db.contact.findMany({
    where: {
      workspaceId: ctx.workspaceId,
      OR: [{ email: { not: null } }, { phoneNormalized: { not: null } }],
    },
    select: { id: true, email: true, phoneNormalized: true },
  });
  const groups = groupDuplicates(candidates);
  if (groups.length === 0) return [];
  const contacts = await db.contact.findMany({
    where: { workspaceId: ctx.workspaceId, id: { in: groups.flatMap((group) => group.ids) } },
    select: contactSummarySelect,
    orderBy: { createdAt: "asc" },
  });
  const byId = new Map(contacts.map((contact) => [contact.id, contact]));
  return groups.map((group) => ({
    key: group.key,
    reasons: group.reasons,
    contacts: group.ids.map((id) => byId.get(id)).filter((contact) => contact !== undefined),
  }));
}

export async function findDuplicatesOf(ctx: Ctx, contactId: string) {
  assertCan(ctx, "records:read");
  const contact = notFoundUnless(
    await db.contact.findFirst({ where: { id: contactId, workspaceId: ctx.workspaceId } }),
    "Contact",
  );
  const or: Prisma.ContactWhereInput[] = [];
  // Emails are stored lower-cased; an exact match avoids LIKE wildcards in addresses ("j_doe").
  if (contact.email) or.push({ email: contact.email.toLowerCase() });
  if (contact.phoneNormalized) or.push({ phoneNormalized: contact.phoneNormalized });
  if (or.length === 0) return [];
  return db.contact.findMany({
    where: { workspaceId: ctx.workspaceId, id: { not: contact.id }, OR: or },
    select: contactSummarySelect,
  });
}

const FILLABLE_FIELDS = ["email", "phone", "jobTitle", "companyId", "ownerId", "source"] as const;

// Values that must not disappear silently when the merged contact differs from the kept one.
const CONFLICT_FIELDS = [
  { field: "email", label: "email" },
  { field: "phone", label: "phone" },
  { field: "jobTitle", label: "job title" },
  { field: "lifecycleStage", label: "lifecycle stage" },
  { field: "source", label: "source" },
] as const;

function sameValue(a: unknown, b: unknown): boolean {
  return String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
}

function isBlank(value: unknown): boolean {
  return value === null || value === undefined || String(value).trim() === "";
}

type ContactRow = Prisma.ContactGetPayload<{ include: { tags: { select: { tagId: true } } } }>;

/** Values of the merged contact that differ from (non-empty) values on the kept contact. */
async function findConflicts(tx: DbClient, ctx: Ctx, kept: ContactRow, merged: ContactRow) {
  const conflicts: Record<string, { kept: unknown; merged: unknown }> = {};
  const lines: string[] = [];
  for (const { field, label } of CONFLICT_FIELDS) {
    const keptValue = kept[field];
    const mergedValue = merged[field];
    if (isBlank(keptValue) || isBlank(mergedValue) || sameValue(keptValue, mergedValue)) continue;
    conflicts[field] = { kept: keptValue, merged: mergedValue };
    lines.push(
      `${label} ${field === "lifecycleStage" ? LIFECYCLE_LABELS[merged.lifecycleStage] : mergedValue}`,
    );
  }
  // Links: the company and the owner, recorded by name.
  for (const [field, label, lookup] of [
    [
      "companyId",
      "company",
      (ids: string[]) =>
        tx.company.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }),
    ],
    [
      "ownerId",
      "owner",
      (ids: string[]) =>
        tx.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }),
    ],
  ] as const) {
    const keptId = kept[field];
    const mergedId = merged[field];
    if (!keptId || !mergedId || keptId === mergedId) continue;
    const names = new Map((await lookup([keptId, mergedId])).map((row) => [row.id, row.name]));
    conflicts[label] = {
      kept: names.get(keptId) ?? keptId,
      merged: names.get(mergedId) ?? mergedId,
    };
    lines.push(`${label} ${names.get(mergedId) ?? mergedId}`);
  }
  const keptFields = asJsonObject(kept.customFields);
  const mergedFields = asJsonObject(merged.customFields);
  const definitions = await loadFieldDefinitions(tx, ctx, "CONTACT");
  for (const key of Object.keys(mergedFields)) {
    const keptValue = Object.hasOwn(keptFields, key) ? keptFields[key] : undefined;
    const mergedValue = mergedFields[key];
    if (isBlank(keptValue) || isBlank(mergedValue) || sameValue(keptValue, mergedValue)) continue;
    conflicts[`customFields.${key}`] = { kept: keptValue, merged: mergedValue };
    const label = definitions.find((definition) => definition.key === key)?.label ?? key;
    lines.push(`${label} ${String(mergedValue)}`);
  }
  return { conflicts, lines };
}

/**
 * Moves everything from `mergeId` to `keepId` and deletes the merged contact: activities, tasks,
 * deals and tags move, empty fields on the kept contact are filled in, and values that differ
 * are kept on record in the audit log and in a note on the kept contact.
 */
async function mergeInto(tx: DbClient, ctx: Ctx, keepId: string, mergeId: string) {
  if (keepId === mergeId) throw new ValidationError("Choose two different contacts to merge.");
  const [keep, merge] = await Promise.all(
    [keepId, mergeId].map((id) =>
      tx.contact.findFirst({
        where: { id, workspaceId: ctx.workspaceId },
        include: { tags: { select: { tagId: true } } },
      }),
    ),
  );
  const kept = notFoundUnless(keep, "Contact");
  const merged = notFoundUnless(merge, "Contact");
  const scope = { workspaceId: ctx.workspaceId };

  const activities = await tx.activity.updateMany({
    where: { ...scope, contactId: merged.id },
    data: { contactId: kept.id },
  });
  const tasks = await tx.task.updateMany({
    where: { ...scope, contactId: merged.id },
    data: { contactId: kept.id },
  });
  const deals = await tx.deal.updateMany({
    where: { ...scope, primaryContactId: merged.id },
    data: { primaryContactId: kept.id },
  });

  const keptTags = new Set(kept.tags.map((tag) => tag.tagId));
  const newTags = merged.tags.map((tag) => tag.tagId).filter((tagId) => !keptTags.has(tagId));
  if (newTags.length > 0) {
    await tx.contactTag.createMany({
      data: newTags.map((tagId) => ({ contactId: kept.id, tagId })),
      skipDuplicates: true,
    });
  }

  const filled: Record<string, unknown> = {};
  for (const field of FILLABLE_FIELDS) {
    if (!kept[field] && merged[field]) filled[field] = merged[field];
  }
  if (filled.phone) filled.phoneNormalized = merged.phoneNormalized;
  const customFields = {
    ...asJsonObject(merged.customFields),
    ...asJsonObject(kept.customFields),
  };
  const { conflicts, lines } = await findConflicts(tx, ctx, kept, merged);

  // Delete first so a unique email/phone never exists twice mid-transaction.
  await tx.contact.delete({ where: { id: merged.id } });
  const result = await tx.contact.update({
    where: { id: kept.id },
    data: { ...filled, customFields: customFields as Prisma.InputJsonValue },
  });

  if (lines.length > 0) {
    await tx.activity.create({
      data: {
        workspaceId: ctx.workspaceId,
        type: "NOTE",
        subject: `Merged from ${fullName(merged)}`.slice(0, 200),
        body: `Values that differed and were not kept: ${lines.join(", ")}.`,
        contactId: kept.id,
        authorId: ctx.userId,
      },
    });
  }

  await recordAudit(tx, ctx, {
    action: "contact.merged",
    entityType: "contact",
    entityId: kept.id,
    changes: {
      mergedContact: {
        id: merged.id,
        name: fullName(merged),
        email: merged.email,
      },
      moved: {
        activities: activities.count,
        tasks: tasks.count,
        deals: deals.count,
        tags: newTags.length,
      },
      filledFields: Object.keys(filled).filter((field) => field !== "phoneNormalized"),
      conflicts,
    },
  });
  return result;
}

/** Merges one contact into another (both must be in the caller's workspace). */
export async function mergeContacts(ctx: Ctx, keepId: string, mergeId: string) {
  assertCan(ctx, "records:write");
  return db.$transaction((tx) => mergeInto(tx, ctx, keepId, mergeId));
}

const mergeGroupSchema = z.object({
  key: z.string().regex(/^(email|phone):.+$/, "Choose a duplicate group."),
  keepId: z.string().min(1).max(64),
  mergeIds: z
    .array(z.string().min(1).max(64))
    .min(1, "Choose at least one contact to merge.")
    .max(100),
});

/**
 * Merges the chosen members of a duplicate group into the one to keep. Every id must be a
 * contact of this workspace that shares the group's email or phone; members left out of
 * `mergeIds` are not touched.
 */
export async function mergeDuplicateGroup(ctx: Ctx, rawInput: unknown) {
  assertCan(ctx, "records:write");
  const input = parseInput(mergeGroupSchema, rawInput);
  const mergeIds = [...new Set(input.mergeIds)];
  if (mergeIds.includes(input.keepId)) {
    throw new ValidationError("The contact you keep cannot also be merged away.");
  }
  const separator = input.key.indexOf(":");
  const kind = input.key.slice(0, separator);
  const value = input.key.slice(separator + 1);
  return db.$transaction(
    async (tx) => {
      const members = await tx.contact.findMany({
        where: {
          workspaceId: ctx.workspaceId,
          id: { in: [input.keepId, ...mergeIds] },
          // Exact matches only: `%` or `_` in the key must not act as wildcards.
          ...(kind === "email" ? { email: value.toLowerCase() } : { phoneNormalized: value }),
        },
        select: { id: true },
      });
      if (members.length !== mergeIds.length + 1) {
        throw new ValidationError("Every contact must belong to this duplicate group.");
      }
      let result = null;
      for (const mergeId of mergeIds) result = await mergeInto(tx, ctx, input.keepId, mergeId);
      return result!;
    },
    // Large groups merge many contacts in one transaction; allow more than the 5 s default.
    { timeout: 30_000 },
  );
}
