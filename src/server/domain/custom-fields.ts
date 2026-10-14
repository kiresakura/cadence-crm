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

/**
 * Validates submitted custom field values against the workspace's definitions.
 *
 * - Keys without a definition are rejected.
 * - Values are coerced to their declared type (form posts send strings).
 * - On update, `existing` values are kept for fields the input does not mention.
 * - Values of deleted definitions are dropped.
 *
 * Errors are reported per field as `customFields.<key>`.
 */
export function validateCustomFieldValues(
  definitions: readonly CustomFieldDefinitionLike[],
  input: Record<string, unknown>,
  existing: Record<string, unknown> = {},
): CustomFieldValues {
  const errors: FieldErrors = {};
  const known = new Set(definitions.map((definition) => definition.key));

  for (const key of Object.keys(input)) {
    if (!known.has(key)) errors[`customFields.${key}`] = ["Unknown custom field."];
  }

  const values: CustomFieldValues = {};
  for (const definition of definitions) {
    const raw = Object.hasOwn(input, definition.key)
      ? input[definition.key]
      : existing[definition.key];
    if (isEmpty(raw)) {
      if (definition.required) {
        errors[`customFields.${definition.key}`] = [`${definition.label} is required.`];
      }
      continue;
    }
    const result = coerce(definition, raw);
    if ("error" in result) {
      errors[`customFields.${definition.key}`] = [result.error];
    } else {
      values[definition.key] = result.value;
    }
  }

  if (Object.keys(errors).length > 0) {
    throw new ValidationError("Some custom fields are invalid.", errors);
  }
  return values;
}

/** Derives a machine key from a label, e.g. "Annual revenue (USD)" -> "annual_revenue_usd". */
export function customFieldKeyFromLabel(label: string): string {
  const key = label
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  return /^[a-z]/.test(key) ? key : `field_${key}`.slice(0, 40);
}
