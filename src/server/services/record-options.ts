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

/**
 * Adds the selected record when the search did not already return it, so the field's value can
 * be seen and chosen again: first while nothing is typed, after the matches when the typed text
 * matches it too. A selection the text does not match is left out (`selected` is null), so it is
 * never offered in place of what was typed.
 */
function withSelected(
  options: RecordOption[],
  selected: RecordOption | null,
  filtered: boolean,
): RecordOption[] {
  if (!selected || options.some((option) => option.id === selected.id)) return options;
  return filtered ? [...options, selected] : [selected, ...options];
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

/** Contacts matching every search term, plus the selected one (see `withSelected`). */
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
  const selectedContactId = selectedIdOf(selectedId);
  const [contacts, selected] = await Promise.all([
    db.contact.findMany({
      where: { workspaceId: ctx.workspaceId, AND: and },
      select: contactSelect,
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }, { id: "asc" }],
      take: OPTION_LIMIT,
    }),
    selectedContactId
      ? db.contact.findFirst({
          where: { id: selectedContactId, workspaceId: ctx.workspaceId, AND: and },
          select: contactSelect,
        })
      : null,
  ]);
  return withSelected(
    contacts.map(contactToOption),
    selected ? contactToOption(selected) : null,
    and.length > 0,
  );
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

/** Companies matching every search term, plus the selected one (see `withSelected`). */
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
  const selectedCompanyId = selectedIdOf(selectedId);
  const select = { id: true, name: true, domain: true } as const;
  const [companies, selected] = await Promise.all([
    db.company.findMany({
      where: { workspaceId: ctx.workspaceId, AND: and },
      select,
      orderBy: [{ name: "asc" }, { id: "asc" }],
      take: OPTION_LIMIT,
    }),
    selectedCompanyId
      ? db.company.findFirst({
          where: { id: selectedCompanyId, workspaceId: ctx.workspaceId, AND: and },
          select,
        })
      : null,
  ]);
  const toOption = (company: { id: string; name: string; domain: string | null }) => ({
    id: company.id,
    label: company.name,
    detail: company.domain,
  });
  return withSelected(
    companies.map(toOption),
    selected ? toOption(selected) : null,
    and.length > 0,
  );
}
