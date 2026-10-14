import type { Prisma } from "@/generated/prisma/client";

import { recordAudit } from "../audit";
import { db } from "../db";
import { ValidationError } from "../errors";
import { assertCan, type Ctx } from "../permissions";
import { asJsonObject, notFoundUnless } from "./guards";

export interface DuplicateCandidate {
  id: string;
  email: string | null;
  phoneNormalized: string | null;
}

export interface DuplicateGroup {
  ids: string[];
  reasons: Array<"email" | "phone">;
}

/**
 * Groups contacts that share an email (case-insensitive) or a normalised phone number.
 * Matches are transitive: A~B by email and B~C by phone puts A, B and C in one group.
 */
export function groupDuplicates(contacts: readonly DuplicateCandidate[]): DuplicateGroup[] {
  // Union-find over contact ids, joined through shared email / phone keys.
  const parent = new Map<string, string>(contacts.map((contact) => [contact.id, contact.id]));
  const find = (id: string): string => {
    let node = id;
    while (parent.get(node) !== node) {
      const next = parent.get(node) as string;
      parent.set(node, parent.get(next) as string);
      node = next;
    }
    return node;
  };

  const firstByKey = new Map<string, string>();
  const matches: Array<{ id: string; reason: "email" | "phone" }> = [];
  for (const contact of contacts) {
    const keys: Array<[string, "email" | "phone"]> = [];
    if (contact.email) keys.push([`e:${contact.email.toLowerCase()}`, "email"]);
    if (contact.phoneNormalized) keys.push([`p:${contact.phoneNormalized}`, "phone"]);
    for (const [key, reason] of keys) {
      const first = firstByKey.get(key);
      if (!first) {
        firstByKey.set(key, contact.id);
        continue;
      }
      const a = find(first);
      const b = find(contact.id);
      if (a !== b) parent.set(b, a);
      matches.push({ id: contact.id, reason });
    }
  }

  const groups = new Map<string, string[]>();
  for (const contact of contacts) {
    const root = find(contact.id);
    groups.set(root, [...(groups.get(root) ?? []), contact.id]);
  }
  const reasons = new Map<string, Set<"email" | "phone">>();
  for (const match of matches) {
    const root = find(match.id);
    reasons.set(root, (reasons.get(root) ?? new Set()).add(match.reason));
  }
  return [...groups.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([root, ids]) => ({ ids, reasons: [...(reasons.get(root) ?? [])].sort() }));
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
  if (contact.email) or.push({ email: { equals: contact.email, mode: "insensitive" } });
  if (contact.phoneNormalized) or.push({ phoneNormalized: contact.phoneNormalized });
  if (or.length === 0) return [];
  return db.contact.findMany({
    where: { workspaceId: ctx.workspaceId, id: { not: contact.id }, OR: or },
    select: contactSummarySelect,
  });
}

const FILLABLE_FIELDS = ["email", "phone", "jobTitle", "companyId", "ownerId", "source"] as const;

/**
 * Merges `mergeId` into `keepId`: activities, tasks, deals and tags move to the kept contact,
 * empty fields on the kept contact are filled from the other one, and the duplicate is deleted.
 */
export async function mergeContacts(ctx: Ctx, keepId: string, mergeId: string) {
  assertCan(ctx, "records:write");
  if (keepId === mergeId) throw new ValidationError("Choose two different contacts to merge.");

  return db.$transaction(async (tx) => {
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

    const [activities, tasks, deals] = await Promise.all([
      tx.activity.updateMany({
        where: { ...scope, contactId: merged.id },
        data: { contactId: kept.id },
      }),
      tx.task.updateMany({
        where: { ...scope, contactId: merged.id },
        data: { contactId: kept.id },
      }),
      tx.deal.updateMany({
        where: { ...scope, primaryContactId: merged.id },
        data: { primaryContactId: kept.id },
      }),
    ]);

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

    // Delete first so a unique email/phone never exists twice mid-transaction.
    await tx.contact.delete({ where: { id: merged.id } });
    const result = await tx.contact.update({
      where: { id: kept.id },
      data: { ...filled, customFields: customFields as Prisma.InputJsonValue },
    });

    await recordAudit(tx, ctx, {
      action: "contact.merged",
      entityType: "contact",
      entityId: kept.id,
      changes: {
        mergedContact: {
          id: merged.id,
          name: `${merged.firstName} ${merged.lastName}`,
          email: merged.email,
        },
        moved: {
          activities: activities.count,
          tasks: tasks.count,
          deals: deals.count,
          tags: newTags.length,
        },
        filledFields: Object.keys(filled).filter((field) => field !== "phoneNormalized"),
      },
    });
    return result;
  });
}
