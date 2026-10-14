import { z } from "zod";

/** Trimmed optional text; empty strings become null. */
export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Must be ${max} characters or fewer.`)
    .nullish()
    .transform((value) => (value ? value : null));

export const requiredText = (label: string, max: number) =>
  z
    .string({ error: `${label} is required.` })
    .trim()
    .min(1, `${label} is required.`)
    .max(max, `${label} must be ${max} characters or fewer.`);

export const optionalEmail = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, "Email is too long.")
  .nullish()
  .transform((value) => (value ? value : null))
  .refine((value) => value === null || z.email().safeParse(value).success, {
    message: "Enter a valid email address.",
  });

export const optionalId = z
  .string()
  .trim()
  .max(64)
  .nullish()
  .transform((value) => (value ? value : null));

export const idList = z
  .array(z.string().trim().min(1).max(64))
  .max(100)
  .default([])
  .transform((ids) => [...new Set(ids)]);

/** A non-negative money amount with at most two decimals, normalised to a string like "1200.50". */
export const moneySchema = z
  .union([z.string(), z.number()], { error: "Enter an amount." })
  .transform((value) => String(value).replace(/[,\s]/g, ""))
  .refine((value) => /^\d{1,12}(\.\d{1,2})?$/.test(value), {
    message: "Enter a positive amount with up to two decimals.",
  });

export const currencySchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/, "Use a three-letter currency code, e.g. USD.");

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

/** Calendar date (YYYY-MM-DD) or null. */
export const optionalDate = z
  .string()
  .trim()
  .nullish()
  .transform((value) => (value ? value : null))
  .refine((value) => value === null || isValidIsoDate(value), { message: "Enter a valid date." });

/** Date-time from an ISO string or a `datetime-local` input, or null. */
export const optionalDateTime = z
  .string()
  .trim()
  .nullish()
  .transform((value) => (value ? value : null))
  .refine((value) => value === null || !Number.isNaN(Date.parse(value)), {
    message: "Enter a valid date and time.",
  });

export const customFieldsInput = z.record(z.string(), z.unknown()).default({});

export function dateOnlyToDate(value: string | null): Date | null {
  return value ? new Date(`${value}T00:00:00.000Z`) : null;
}

export function dateToDateOnly(value: Date | null | undefined): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

/**
 * Converts submitted form data into a plain object for schema parsing.
 * `cf.<key>` entries are collected into `customFields`; keys listed in `arrays` keep every value.
 */
export function formToObject(
  formData: FormData,
  options: { arrays?: readonly string[] } = {},
): Record<string, unknown> {
  // Maps, then `Object.fromEntries`: a field named "__proto__" stays an ordinary key.
  const result = new Map<string, unknown>();
  const customFields = new Map<string, unknown>();
  for (const [key, value] of formData.entries()) {
    if (typeof value !== "string" || key.startsWith("$ACTION")) continue;
    if (key.startsWith("cf.")) {
      customFields.set(key.slice(3), value);
    } else if (options.arrays?.includes(key)) {
      const list = (result.get(key) as string[] | undefined) ?? [];
      if (value) list.push(value);
      result.set(key, list);
    } else {
      result.set(key, value);
    }
  }
  for (const key of options.arrays ?? []) if (!result.has(key)) result.set(key, []);
  if (customFields.size > 0) result.set("customFields", Object.fromEntries(customFields));
  return Object.fromEntries(result);
}
