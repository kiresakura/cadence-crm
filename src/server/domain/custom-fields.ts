import type { CustomFieldType } from "@/generated/prisma/enums";

import { ValidationError, type FieldErrors } from "../errors";
import { isValidIsoDate } from "../validation/common";

export interface CustomFieldDefinitionLike {
  key: string;
  label: string;
  type: CustomFieldType;
  options: string[];
  required: boolean;
}

export type CustomFieldValue = string | number | boolean;
export type CustomFieldValues = Record<string, CustomFieldValue>;

const TRUE_VALUES = new Set(["true", "on", "1", "yes"]);
const FALSE_VALUES = new Set(["false", "off", "0", "no"]);

function isEmpty(value: unknown): boolean {
  return (
    value === undefined || value === null || (typeof value === "string" && value.trim() === "")
  );
}

function coerce(
  definition: CustomFieldDefinitionLike,
  raw: unknown,
): { value: CustomFieldValue } | { error: string } {
  switch (definition.type) {
    case "TEXT": {
      if (typeof raw !== "string" && typeof raw !== "number") return { error: "Enter text." };
      const text = String(raw).trim();
      return text.length > 1000 ? { error: "Must be 1000 characters or fewer." } : { value: text };
    }
    case "NUMBER": {
      const number = typeof raw === "number" ? raw : Number(String(raw).trim());
      return typeof raw === "boolean" || !Number.isFinite(number)
        ? { error: "Enter a number." }
        : { value: number };
    }
    case "DATE": {
      const text = String(raw).trim();
      return isValidIsoDate(text) ? { value: text } : { error: "Enter a date as YYYY-MM-DD." };
    }
    case "SELECT": {
      const text = String(raw).trim();
      return definition.options.includes(text)
        ? { value: text }
        : { error: `Choose one of: ${definition.options.join(", ")}.` };
    }
    case "BOOLEAN": {
      if (typeof raw === "boolean") return { value: raw };
      const text = String(raw).trim().toLowerCase();
      if (TRUE_VALUES.has(text)) return { value: true };
      if (FALSE_VALUES.has(text)) return { value: false };
      return { error: "Choose yes or no." };
    }
  }
}

function isStoredValue(value: unknown): value is CustomFieldValue {
  return (
    (typeof value === "string" && value.trim() !== "") ||
    typeof value === "number" ||
    typeof value === "boolean"
  );
}

/** Form posts send strings, so "12" equals a stored 12 and "false" a stored false. */
function isUnchanged(raw: unknown, stored: unknown): boolean {
  if (isEmpty(raw)) return isEmpty(stored);
  return isStoredValue(stored) && String(raw).trim() === String(stored).trim();
}

/**
 * Validates submitted custom field values against the workspace's definitions.
 *
 * - Keys without a definition are rejected.
 * - Values are coerced to their declared type (form posts send strings).
 * - On update (`existing` given), values the input does not mention are kept, and so are
 *   values that did not change, without re-validating them. A select option removed later or
 *   a field made required later therefore never blocks unrelated edits; a changed value is
 *   always checked against the current definition.
 * - Values of deleted definitions are dropped.
 *
 * Keys are only read as own properties, so labels like "constructor" are ordinary keys.
 * Errors are reported per field as `customFields.<key>`.
 */
export function validateCustomFieldValues(
  definitions: readonly CustomFieldDefinitionLike[],
  input: Record<string, unknown>,
  existing?: Record<string, unknown>,
): CustomFieldValues {
  const errors: FieldErrors = {};
  const known = new Set(definitions.map((definition) => definition.key));

  for (const key of Object.keys(input)) {
    if (!known.has(key)) errors[`customFields.${key}`] = ["Unknown custom field."];
  }

  const values = new Map<string, CustomFieldValue>();
  for (const definition of definitions) {
    const { key } = definition;
    const stored = existing && Object.hasOwn(existing, key) ? existing[key] : undefined;
    const raw = Object.hasOwn(input, key) ? input[key] : stored;
    if (existing && isUnchanged(raw, stored)) {
      if (isStoredValue(stored)) values.set(key, stored);
      continue;
    }
    if (isEmpty(raw)) {
      if (definition.required) {
        errors[`customFields.${key}`] = [`${definition.label} is required.`];
      }
      continue;
    }
    const result = coerce(definition, raw);
    if ("error" in result) {
      errors[`customFields.${key}`] = [result.error];
    } else {
      values.set(key, result.value);
    }
  }

  if (Object.keys(errors).length > 0) {
    throw new ValidationError("Some custom fields are invalid.", errors);
  }
  // `Object.fromEntries` defines own properties, so even "__proto__" stays a plain key.
  return Object.fromEntries(values);
}

// Keys that collide with properties every JavaScript object inherits.
const RESERVED_KEYS = new Set(
  [...Object.getOwnPropertyNames(Object.prototype), "prototype"].map((name) => name.toLowerCase()),
);

export function isReservedFieldKey(key: string): boolean {
  return RESERVED_KEYS.has(key.toLowerCase());
}

/**
 * Derives a machine key from a label, e.g. "Annual revenue (USD)" -> "annual_revenue_usd".
 * Labels without Latin letters or digits become "field"; the service numbers repeats.
 */
export function customFieldKeyFromLabel(label: string): string {
  const key = label
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  if (!key) return "field";
  return /^[a-z]/.test(key) && !isReservedFieldKey(key) ? key : `field_${key}`.slice(0, 40);
}
