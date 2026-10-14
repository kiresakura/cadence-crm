import Papa from "papaparse";

import { ValidationError } from "../errors";

export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;
export const MAX_IMPORT_ROWS = 5000;

export const CONTACT_IMPORT_FIELDS = [
  {
    key: "firstName",
    label: "First name",
    aliases: ["first name", "firstname", "first", "given name", "名", "名字"],
  },
  {
    key: "lastName",
    label: "Last name",
    aliases: ["last name", "lastname", "last", "surname", "family name", "姓", "姓氏"],
  },
  {
    key: "fullName",
    label: "Full name",
    aliases: ["name", "full name", "contact name", "contact", "姓名", "全名"],
  },
  {
    key: "email",
    label: "Email",
    aliases: [
      "email",
      "e mail",
      "email address",
      "work email",
      "電子郵件",
      "電子信箱",
      "信箱",
      "电子邮件",
      "电子信箱",
      "邮箱",
    ],
  },
  {
    key: "phone",
    label: "Phone",
    aliases: [
      "phone",
      "phone number",
      "mobile",
      "telephone",
      "tel",
      "電話",
      "手機",
      "电话",
      "手机",
    ],
  },
  {
    key: "jobTitle",
    label: "Job title",
    aliases: ["job title", "title", "position", "role", "職稱", "职称"],
  },
  {
    key: "companyName",
    label: "Company",
    aliases: ["company", "company name", "organization", "organisation", "account", "公司"],
  },
  {
    key: "lifecycleStage",
    label: "Lifecycle stage",
    aliases: ["lifecycle stage", "lifecycle", "status"],
  },
  { key: "source", label: "Source", aliases: ["source", "lead source", "channel"] },
  { key: "tags", label: "Tags", aliases: ["tags", "labels", "標籤", "标签"] },
] as const;

export type ImportFieldKey = (typeof CONTACT_IMPORT_FIELDS)[number]["key"];
export type ColumnMapping = Record<string, ImportFieldKey | null>;
export type MappedRow = { rowNumber: number; values: Partial<Record<ImportFieldKey, string>> };

const FIELD_KEYS = new Set<string>(CONTACT_IMPORT_FIELDS.map((field) => field.key));

export function isImportFieldKey(value: string): value is ImportFieldKey {
  return FIELD_KEYS.has(value);
}

/** "  Ｅ-mail " -> "e mail": NFKC, lower case, letters and digits of any script. */
function normalizeHeader(header: string): string {
  return header
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export interface ParsedCsv {
  headers: string[];
  rows: Record<string, string>[];
  /** Spreadsheet row of each entry in `rows`; the header is row 1 and blank rows still count. */
  rowNumbers: number[];
}

export function parseCsv(text: string): ParsedCsv {
  if (Buffer.byteLength(text, "utf8") > MAX_IMPORT_BYTES) {
    throw new ValidationError("The file is larger than 2 MB.");
  }
  // Records are read without skipping blank lines so row numbers match the spreadsheet.
  const result = Papa.parse<string[]>(text.replace(/^\uFEFF/, ""), {
    header: false,
    skipEmptyLines: false,
  });
  const [headerRow = [], ...records] = result.data;
  const columns = headerRow.map((header) => header.trim());
  const headers = columns.filter((header) => header.length > 0);
  if (headers.length === 0) {
    throw new ValidationError("The file has no header row.");
  }
  // Only identical names clash; "名字" and "姓氏" are different columns.
  const repeated = headers.filter((header, index) => headers.indexOf(header) !== index);
  if (repeated.length > 0) {
    throw new ValidationError(
      `The header row contains duplicate column names: ${[...new Set(repeated)].join(", ")}.`,
    );
  }

  const rows: Record<string, string>[] = [];
  const rowNumbers: number[] = [];
  records.forEach((record, index) => {
    if (record.every((cell) => cell.trim() === "")) return;
    const row = new Map<string, string>();
    columns.forEach((header, column) => {
      if (header) row.set(header, record[column] ?? "");
    });
    rows.push(Object.fromEntries(row));
    rowNumbers.push(index + 2);
  });
  if (rows.length > MAX_IMPORT_ROWS) {
    throw new ValidationError(`Import at most ${MAX_IMPORT_ROWS} rows at a time.`);
  }
  return { headers, rows, rowNumbers };
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
  rowNumbers?: readonly number[],
): MappedRow[] {
  return rows.map((row, index) => {
    const values: Partial<Record<ImportFieldKey, string>> = {};
    for (const [header, field] of Object.entries(mapping)) {
      if (!field) continue;
      const value = Object.hasOwn(row, header) ? row[header]?.trim() : undefined;
      if (value) values[field] = value;
    }
    // Row 1 is the header, so data starts on row 2.
    return { rowNumber: rowNumbers?.[index] ?? index + 2, values };
  });
}

const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
const HAN_NAME = /^\p{Script=Han}{2,4}$/u;

// Two-character Chinese family names, in traditional and simplified forms.
const COMPOUND_SURNAMES = new Set([
  "歐陽",
  "欧阳",
  "司馬",
  "司马",
  "上官",
  "諸葛",
  "诸葛",
  "東方",
  "东方",
  "皇甫",
  "尉遲",
  "尉迟",
  "公孫",
  "公孙",
  "慕容",
  "長孫",
  "长孙",
  "宇文",
  "司徒",
  "令狐",
  "夏侯",
  "端木",
  "張簡",
  "张简",
  "范姜",
]);

/**
 * Splits a full name into first and last name, or returns null when that cannot be done
 * safely (a single Latin word, a single character, or a long unspaced name).
 *
 * - Latin script: the last word is the last name ("Mary Ann Evans" -> "Mary Ann" + "Evans").
 * - Chinese, Japanese and Korean: the family name comes first. With a space, the first word is
 *   the family name ("山田 太郎"); without one, 2–4 Han characters are split after the first
 *   character, or after a known two-character family name ("歐陽娜娜" -> "歐陽" + "娜娜").
 */
export function splitFullName(fullName: string): { firstName: string; lastName: string } | null {
  const name = fullName.trim();
  const parts = name.split(/\s+/).filter(Boolean);
  if (CJK.test(name)) {
    if (parts.length > 1) return { lastName: parts[0]!, firstName: parts.slice(1).join(" ") };
    if (!HAN_NAME.test(name)) return null;
    const characters = [...name];
    const surnameLength =
      characters.length >= 3 && COMPOUND_SURNAMES.has(characters.slice(0, 2).join("")) ? 2 : 1;
    return {
      lastName: characters.slice(0, surnameLength).join(""),
      firstName: characters.slice(surnameLength).join(""),
    };
  }
  if (parts.length < 2) return null;
  return { firstName: parts.slice(0, -1).join(" "), lastName: parts.at(-1)! };
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
