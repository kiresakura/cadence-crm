/** Helpers for turning URL search params into validated list queries. */

export type SearchParamsInput =
  URLSearchParams | Record<string, string | string[] | undefined> | undefined | null;

export function searchParamsToObject(input: SearchParamsInput): Record<string, string> {
  if (!input) return {};
  if (input instanceof URLSearchParams) return Object.fromEntries(input.entries());
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(input)) {
    const first = Array.isArray(value) ? value[0] : value;
    if (first !== undefined) result[key] = first;
  }
  return result;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

export function pageOf<T>(items: T[], total: number, page: number, pageSize: number): Page<T> {
  return { items, total, page, pageSize, pageCount: Math.max(1, Math.ceil(total / pageSize)) };
}

/** Splits a search string into terms; every term must match at least one field. */
export function searchTerms(q: string | undefined): string[] {
  return (q ?? "")
    .split(/\s+/)
    .map((term) => term.trim())
    .filter(Boolean)
    .slice(0, 5);
}

export const EXPORT_LIMIT = 10_000;
