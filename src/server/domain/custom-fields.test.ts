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

describe("updates after a definition becomes stricter", () => {
  const stricter: CustomFieldDefinitionLike[] = [
    { key: "tier", label: "Tier", type: "SELECT", options: ["Alpha 2", "Beta"], required: false },
    { key: "region", label: "Region", type: "TEXT", options: [], required: true },
  ];

  it("keeps a value whose select option was removed while it is not changed", () => {
    expect(validateCustomFieldValues(stricter, { tier: "Alpha" }, { tier: "Alpha" })).toEqual({
      tier: "Alpha",
    });
    expect(validateCustomFieldValues(stricter, {}, { tier: "Alpha", region: "North" })).toEqual({
      tier: "Alpha",
      region: "North",
    });
  });

  it("keeps an empty value of a field made required later, until it is edited", () => {
    expect(validateCustomFieldValues(stricter, { region: "" }, {})).toEqual({});
    expect(validateCustomFieldValues(stricter, {}, {})).toEqual({});
  });

  it("validates values that change against the current definition", () => {
    const errors = fieldErrors(() =>
      validateCustomFieldValues(stricter, { tier: "Gamma" }, { tier: "Alpha" }),
    );
    expect(errors["customFields.tier"]?.[0]).toContain("Alpha 2, Beta");
    expect(
      fieldErrors(() => validateCustomFieldValues(stricter, { region: "" }, { region: "North" })),
    ).toEqual({ "customFields.region": ["Region is required."] });
  });

  it("still requires required fields on create", () => {
    expect(fieldErrors(() => validateCustomFieldValues(stricter, {}))).toEqual({
      "customFields.region": ["Region is required."],
    });
  });

  it("compares form strings with stored typed values", () => {
    const typed: CustomFieldDefinitionLike[] = [
      { key: "seats", label: "Seats", type: "NUMBER", options: [], required: false },
      { key: "vip", label: "VIP", type: "BOOLEAN", options: [], required: false },
    ];
    expect(
      validateCustomFieldValues(typed, { seats: "12", vip: "false" }, { seats: 12, vip: false }),
    ).toEqual({ seats: 12, vip: false });
  });
});

describe("keys named like object built-ins", () => {
  const builtIns: CustomFieldDefinitionLike[] = [
    { key: "constructor", label: "Constructor", type: "TEXT", options: [], required: false },
    { key: "tostring", label: "toString", type: "TEXT", options: [], required: false },
  ];

  it("are looked up as own properties only", () => {
    expect(validateCustomFieldValues(builtIns, {})).toEqual({});
    expect(validateCustomFieldValues(builtIns, {}, {})).toEqual({});
    const values = validateCustomFieldValues(builtIns, { constructor: "Bob the builder" });
    expect(Object.hasOwn(values, "constructor")).toBe(true);
    expect(values.constructor).toBe("Bob the builder");
  });

  it("cannot change an object's prototype", () => {
    const input = JSON.parse('{"__proto__": {"polluted": true}}') as Record<string, unknown>;
    const errors = fieldErrors(() => validateCustomFieldValues(builtIns, input));
    expect(errors).toEqual({ "customFields.__proto__": ["Unknown custom field."] });
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

describe("customFieldKeyFromLabel", () => {
  it("builds snake_case keys", () => {
    expect(customFieldKeyFromLabel("Annual revenue (USD)")).toBe("annual_revenue_usd");
    expect(customFieldKeyFromLabel("2024 budget")).toBe("field_2024_budget");
  });

  it("avoids names of object built-ins", () => {
    expect(customFieldKeyFromLabel("Constructor")).toBe("field_constructor");
    // Underscores at the edges are trimmed, so "__proto__" can never come out as a key.
    expect(customFieldKeyFromLabel("__proto__")).toBe("proto");
    expect(customFieldKeyFromLabel("Prototype")).toBe("field_prototype");
    expect(customFieldKeyFromLabel("toString")).toBe("field_tostring");
    expect(customFieldKeyFromLabel("Has own property")).toBe("has_own_property");
  });

  it("falls back to a generic key for labels without Latin letters or digits", () => {
    expect(customFieldKeyFromLabel("預算")).toBe("field");
    expect(customFieldKeyFromLabel("產業04t")).toBe("field_04t");
  });
});
