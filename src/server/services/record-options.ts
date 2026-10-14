import type { Prisma } from "@/generated/prisma/client";
import { fullName } from "@/lib/format";

import { db } from "../db";
import { assertCan, type Ctx } from "../permissions";
import { searchTerms } from "./query";

/** Most options a picker shows at once; typing narrows the search on the server. */
export const OPTION_LIMIT = 20;

export interface RecordOption {
  id: string;
  label: string;
  detail: string | null;
}

const contactSelect = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  company: { select: { name: true } },
} as const;

type ContactRow = Prisma.ContactGetPayload<{ select: typeof contactSelect }>;

function contactToOption(contact: ContactRow): RecordOption {
  return {
    id: contact.id,
    label: fullName(contact),
    detail: contact.company?.name ?? contact.email ?? null,
  };
}

function queryText(query: unknown): string {
  return typeof query === "string" ? query.slice(0, 100) : "";
}

function selectedIdOf(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 && value.length <= 64 ? value : null;
}

/** Puts the selected record first when the search did not already return it. */
function withSelected(options: RecordOption[], selected: RecordOption | null): RecordOption[] {
  if (!selected || options.some((option) => option.id === selected.id)) return options;
  return [selected, ...options];
}

export async function contactOption(ctx: Ctx, id: unknown): Promise<RecordOption | null> {
  assertCan(ctx, "records:read");
  const contactId = selectedIdOf(id);
  if (!contactId) return null;
  const contact = await db.contact.findFirst({
    where: { id: contactId, workspaceId: ctx.workspaceId },
    select: contactSelect,
  });
  return contact ? contactToOption(contact) : null;
}

/** Contacts matching every search term, plus the currently selected one. */
export async function searchContactOptions(
  ctx: Ctx,
  query: unknown,
  selectedId?: unknown,
): Promise<RecordOption[]> {
  assertCan(ctx, "records:read");
  const and: Prisma.ContactWhereInput[] = searchTerms(queryText(query)).map((term) => ({
    OR: [
      { firstName: { contains: term, mode: "insensitive" } },
      { lastName: { contains: term, mode: "insensitive" } },
      { email: { contains: term, mode: "insensitive" } },
    ],
  }));
  const [contacts, selected] = await Promise.all([
    db.contact.findMany({
      where: { workspaceId: ctx.workspaceId, AND: and },
      select: contactSelect,
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }, { id: "asc" }],
      take: OPTION_LIMIT,
    }),
    contactOption(ctx, selectedId),
  ]);
  return withSelected(contacts.map(contactToOption), selected);
}

export async function companyOption(ctx: Ctx, id: unknown): Promise<RecordOption | null> {
  assertCan(ctx, "records:read");
  const companyId = selectedIdOf(id);
  if (!companyId) return null;
  const company = await db.company.findFirst({
    where: { id: companyId, workspaceId: ctx.workspaceId },
    select: { id: true, name: true, domain: true },
  });
  return company ? { id: company.id, label: company.name, detail: company.domain } : null;
}

/** Companies matching every search term, plus the currently selected one. */
export async function searchCompanyOptions(
  ctx: Ctx,
  query: unknown,
  selectedId?: unknown,
): Promise<RecordOption[]> {
  assertCan(ctx, "records:read");
  const and: Prisma.CompanyWhereInput[] = searchTerms(queryText(query)).map((term) => ({
    OR: [
      { name: { contains: term, mode: "insensitive" } },
      { domain: { contains: term, mode: "insensitive" } },
    ],
  }));
  const [companies, selected] = await Promise.all([
    db.company.findMany({
      where: { workspaceId: ctx.workspaceId, AND: and },
      select: { id: true, name: true, domain: true },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      take: OPTION_LIMIT,
    }),
    companyOption(ctx, selectedId),
  ]);
  return withSelected(
    companies.map((company) => ({ id: company.id, label: company.name, detail: company.domain })),
    selected,
  );
}
