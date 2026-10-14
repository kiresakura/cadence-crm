import { describe, expect, it } from "vitest";

import { ValidationError } from "../errors";
import {
  customFieldKeyFromLabel,
  validateCustomFieldValues,
  type CustomFieldDefinitionLike,
} from "./custom-fields";

const definitions: CustomFieldDefinitionLike[] = [
  { key: "linkedin", label: "LinkedIn", type: "TEXT", options: [], required: false },
  { key: "seats", label: "Seats", type: "NUMBER", options: [], required: true },
  { key: "renewal", label: "Renewal date", type: "DATE", options: [], required: false },
  { key: "tier", label: "Tier", type: "SELECT", options: ["Gold", "Silver"], required: false },
  { key: "newsletter", label: "Newsletter", type: "BOOLEAN", options: [], required: false },
];

function fieldErrors(fn: () => unknown): Record<string, string[]> {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(ValidationError);
    return (error as ValidationError).fieldErrors ?? {};
  }
  throw new Error("expected a validation error");
}

describe("validateCustomFieldValues", () => {
  it("coerces form strings to typed values", () => {
    expect(
      validateCustomFieldValues(definitions, {
        linkedin: "  in/ada  ",
        seats: "12",
        renewal: "2026-12-31",
        tier: "Gold",
        newsletter: "on",
      }),
    ).toEqual({
      linkedin: "in/ada",
      seats: 12,
      renewal: "2026-12-31",
      tier: "Gold",
      newsletter: true,
    });
  });

  it("accepts native JSON types", () => {
    expect(validateCustomFieldValues(definitions, { seats: 3.5, newsletter: false })).toEqual({
      seats: 3.5,
      newsletter: false,
    });
  });

  it("reports every invalid field under its key", () => {
    const errors = fieldErrors(() =>
      validateCustomFieldValues(definitions, {
        seats: "lots",
        renewal: "2026-02-30",
        tier: "Bronze",
        newsletter: "maybe",
        unknown: "x",
      }),
    );
    expect(Object.keys(errors).sort()).toEqual([
      "customFields.newsletter",
      "customFields.renewal",
      "customFields.seats",
      "customFields.tier",
      "customFields.unknown",
    ]);
    expect(errors["customFields.tier"]?.[0]).toContain("Gold, Silver");
  });

  it("enforces required fields", () => {
    const errors = fieldErrors(() => validateCustomFieldValues(definitions, { seats: "  " }));
    expect(errors).toEqual({ "customFields.seats": ["Seats is required."] });
  });

  it("keeps existing values that the input does not mention and drops removed definitions", () => {
    expect(
      validateCustomFieldValues(
        definitions,
        { tier: "Silver" },
        { seats: 4, linkedin: "in/grace", retired_field: "gone" },
      ),
    ).toEqual({ seats: 4, linkedin: "in/grace", tier: "Silver" });
  });

  it("lets an update clear an optional value", () => {
    expect(
      validateCustomFieldValues(definitions, { linkedin: "" }, { seats: 1, linkedin: "x" }),
    ).toEqual({
      seats: 1,
    });
  });

  it("rejects overly long text and booleans for numbers", () => {
    const errors = fieldErrors(() =>
      validateCustomFieldValues(definitions, { seats: true, linkedin: "x".repeat(1001) }),
    );
    expect(errors["customFields.seats"]).toEqual(["Enter a number."]);
    expect(errors["customFields.linkedin"]).toEqual(["Must be 1000 characters or fewer."]);
  });
});

describe("customFieldKeyFromLabel", () => {
  it("builds snake_case keys", () => {
    expect(customFieldKeyFromLabel("Annual revenue (USD)")).toBe("annual_revenue_usd");
    expect(customFieldKeyFromLabel("2024 budget")).toBe("field_2024_budget");
  });
});
