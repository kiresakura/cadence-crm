import Papa from "papaparse";

import { ValidationError } from "../errors";

export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;
export const MAX_IMPORT_ROWS = 5000;

export const CONTACT_IMPORT_FIELDS = [
  {
    key: "firstName",
    label: "First name",
    aliases: ["first name", "firstname", "first", "given name"],
  },
  {
    key: "lastName",
    label: "Last name",
    aliases: ["last name", "lastname", "last", "surname", "family name"],
  },
  {
    key: "fullName",
    label: "Full name",
    aliases: ["name", "full name", "contact name", "contact"],
  },
  { key: "email", label: "Email", aliases: ["email", "e mail", "email address", "work email"] },
  {
    key: "phone",
    label: "Phone",
    aliases: ["phone", "phone number", "mobile", "telephone", "tel"],
  },
  { key: "jobTitle", label: "Job title", aliases: ["job title", "title", "position", "role"] },
  {
    key: "companyName",
    label: "Company",
    aliases: ["company", "company name", "organization", "organisation", "account"],
  },
  {
    key: "lifecycleStage",
    label: "Lifecycle stage",
    aliases: ["lifecycle stage", "lifecycle", "status"],
  },
  { key: "source", label: "Source", aliases: ["source", "lead source", "channel"] },
  { key: "tags", label: "Tags", aliases: ["tags", "labels"] },
] as const;

export type ImportFieldKey = (typeof CONTACT_IMPORT_FIELDS)[number]["key"];
export type ColumnMapping = Record<string, ImportFieldKey | null>;
export type MappedRow = { rowNumber: number; values: Partial<Record<ImportFieldKey, string>> };

const FIELD_KEYS = new Set<string>(CONTACT_IMPORT_FIELDS.map((field) => field.key));

export function isImportFieldKey(value: string): value is ImportFieldKey {
  return FIELD_KEYS.has(value);
}

function normalizeHeader(header: string): string {
  return header
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function parseCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
  if (text.length > MAX_IMPORT_BYTES) {
    throw new ValidationError("The file is larger than 2 MB.");
  }
  const result = Papa.parse<Record<string, string>>(text.replace(/^﻿/, ""), {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (header) => header.trim(),
  });
  const headers = (result.meta.fields ?? []).filter((header) => header.length > 0);
  if (headers.length === 0) {
    throw new ValidationError("The file has no header row.");
  }
  if (new Set(headers.map(normalizeHeader)).size !== headers.length) {
    throw new ValidationError("The header row contains duplicate column names.");
  }
  if (result.data.length > MAX_IMPORT_ROWS) {
    throw new ValidationError(`Import at most ${MAX_IMPORT_ROWS} rows at a time.`);
  }
  return { headers, rows: result.data };
}

/** Guesses which CRM field each CSV column holds, using common header spellings. */
export function suggestMapping(headers: readonly string[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  const used = new Set<ImportFieldKey>();
  for (const header of headers) {
    const normalized = normalizeHeader(header);
    const match = CONTACT_IMPORT_FIELDS.find(
      (field) =>
        !used.has(field.key) &&
        (normalizeHeader(field.key) === normalized ||
          (field.aliases as readonly string[]).includes(normalized)),
    );
    mapping[header] = match?.key ?? null;
    if (match) used.add(match.key);
  }
  return mapping;
}

export function applyMapping(
  rows: readonly Record<string, string>[],
  mapping: ColumnMapping,
): MappedRow[] {
  return rows.map((row, index) => {
    const values: Partial<Record<ImportFieldKey, string>> = {};
    for (const [header, field] of Object.entries(mapping)) {
      if (!field) continue;
      const value = row[header]?.trim();
      if (value) values[field] = value;
    }
    // Row 1 is the header, so data starts on row 2.
    return { rowNumber: index + 2, values };
  });
}

/** Splits "Ada Lovelace" into first and last name; a single word becomes the first name. */
export function splitFullName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0] ?? "", lastName: "" };
  return { firstName: parts.slice(0, -1).join(" "), lastName: parts.at(-1) ?? "" };
}

/**
 * Escapes one CSV cell. Text that a spreadsheet would evaluate as a formula
 * (=, +, -, @, tab, carriage return) is prefixed with a single quote.
 */
export function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let text = value instanceof Date ? value.toISOString() : String(value);
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(text)) {
    text = `'${text}`;
  }
  return /[",\r\n]/.test(text) || /^\s|\s$/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv<T extends Record<string, unknown>>(
  columns: ReadonlyArray<{ key: keyof T & string; label: string }>,
  rows: readonly T[],
): string {
  const lines = [columns.map((column) => escapeCsvCell(column.label)).join(",")];
  for (const row of rows) {
    lines.push(columns.map((column) => escapeCsvCell(row[column.key])).join(","));
  }
  return `${lines.join("\r\n")}\r\n`;
}
