import { describe, expect, it } from "vitest";
import { z } from "zod";

import { Prisma } from "@/generated/prisma/client";

import { diffFields, toAuditValue } from "./audit";
import { hashPassword, verifyPassword } from "./auth/password";
import { generateSessionToken, hashSessionToken } from "./auth/session";
import { ValidationError, parseInput, zodFieldErrors } from "./errors";
import { RateLimiter } from "./rate-limit";
import { groupDuplicates } from "./services/duplicates";
import { formToObject, moneySchema, optionalDate, optionalEmail } from "./validation/common";
import { contactSchema, customFieldDefinitionSchema, registerSchema } from "./validation/schemas";

describe("passwords", () => {
  it("hashes with argon2id and verifies", async () => {
    const hash = await hashPassword("correct horse battery");
    expect(hash).toMatch(/^\$argon2id\$/);
    expect(await verifyPassword(hash, "correct horse battery")).toBe(true);
    expect(await verifyPassword(hash, "wrong")).toBe(false);
    expect(await verifyPassword("not-a-hash", "x")).toBe(false);
  });
});

describe("session tokens", () => {
  it("are random and stored only as an HMAC", () => {
    const token = generateSessionToken();
    expect(token).toHaveLength(43);
    expect(generateSessionToken()).not.toBe(token);
    expect(hashSessionToken(token, "a".repeat(32))).toMatch(/^[0-9a-f]{64}$/);
    expect(hashSessionToken(token, "a".repeat(32))).not.toBe(
      hashSessionToken(token, "b".repeat(32)),
    );
  });
});

describe("audit diffs", () => {
  it("records only changed fields in comparable form", () => {
    const before = {
      name: "Ada",
      amount: new Prisma.Decimal("10"),
      when: new Date(0),
      tags: ["a"],
    };
    const after = {
      name: "Ada",
      amount: new Prisma.Decimal("12.5"),
      when: new Date(0),
      tags: ["a", "b"],
    };
    expect(diffFields(before, after, ["name", "amount", "when", "tags"])).toEqual({
      amount: { from: "10.00", to: "12.50" },
      tags: { from: ["a"], to: ["a", "b"] },
    });
    expect(diffFields(before, before, ["name"])).toBeNull();
  });

  it("sorts object keys so JSON values compare stably", () => {
    expect(JSON.stringify(toAuditValue({ b: 1, a: undefined }))).toBe('{"a":null,"b":1}');
  });
});

describe("errors", () => {
  it("maps zod issues to dotted field paths", () => {
    const schema = z.object({
      name: z.string().min(1, "Required"),
      nested: z.object({ n: z.number() }),
    });
    const result = schema.safeParse({ name: "", nested: { n: "x" } });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(Object.keys(zodFieldErrors(result.error))).toEqual(["name", "nested.n"]);
    }
    expect(() => parseInput(schema, {})).toThrow(ValidationError);
  });
});

describe("rate limiter", () => {
  it("blocks after the limit until the window resets", () => {
    const limiter = new RateLimiter(2, 1000);
    expect(limiter.consume("k", 0).allowed).toBe(true);
    expect(limiter.consume("k", 10).allowed).toBe(true);
    expect(limiter.consume("k", 20)).toEqual({ allowed: false, retryAfterMs: 980 });
    expect(limiter.consume("k", 1000).allowed).toBe(true);
    limiter.reset("k");
    expect(limiter.consume("k", 1001).allowed).toBe(true);
  });
});

describe("groupDuplicates", () => {
  it("groups by one shared email or phone without chaining groups together", () => {
    // A and B share a phone, B and C share an email: two groups, never A with C.
    const groups = groupDuplicates([
      { id: "a", email: "a@example.com", phoneNormalized: "15550100" },
      { id: "b", email: "shared@example.com", phoneNormalized: "15550100" },
      { id: "c", email: "SHARED@example.com", phoneNormalized: null },
      { id: "d", email: "solo@example.com", phoneNormalized: "999999999" },
    ]);
    expect(groups).toEqual([
      { key: "email:shared@example.com", ids: ["b", "c"], reasons: ["email"] },
      { key: "phone:15550100", ids: ["a", "b"], reasons: ["phone"] },
    ]);
    expect(groups.some((group) => group.ids.includes("a") && group.ids.includes("c"))).toBe(false);
  });

  it("shows people who share both an email and a phone once", () => {
    expect(
      groupDuplicates([
        { id: "a", email: "x@example.com", phoneNormalized: "1555" },
        { id: "b", email: "X@example.com", phoneNormalized: "1555" },
      ]),
    ).toEqual([{ key: "email:x@example.com", ids: ["a", "b"], reasons: ["email", "phone"] }]);
  });

  it("returns nothing when there are no duplicates", () => {
    expect(groupDuplicates([{ id: "a", email: "a@example.com", phoneNormalized: null }])).toEqual(
      [],
    );
  });
});

describe("validation helpers", () => {
  it("collects custom fields and multi-value keys from form data", () => {
    const form = new FormData();
    form.append("firstName", "Ada");
    form.append("tagIds", "t1");
    form.append("tagIds", "t2");
    form.append("cf.tier", "Gold");
    form.append("$ACTION_ID_123", "");
    expect(formToObject(form, { arrays: ["tagIds", "other"] })).toEqual({
      firstName: "Ada",
      tagIds: ["t1", "t2"],
      other: [],
      customFields: { tier: "Gold" },
    });
  });

  it("keeps form fields named like object built-ins as plain keys", () => {
    const form = new FormData();
    form.append("cf.constructor", "Bob");
    form.append("cf.__proto__", "x");
    form.append("__proto__", "y");
    const object = formToObject(form);
    const fields = object.customFields as Record<string, unknown>;
    expect(Object.hasOwn(fields, "constructor")).toBe(true);
    expect(Object.hasOwn(fields, "__proto__")).toBe(true);
    expect(Object.hasOwn(object, "__proto__")).toBe(true);
    expect(Object.getPrototypeOf(fields)).toBe(Object.prototype);
  });

  it("accepts only well-formed thousands separators in amounts", () => {
    expect(moneySchema.parse("1,234.56")).toBe("1234.56");
    expect(moneySchema.parse(" 1 000 ")).toBe("1000");
    expect(moneySchema.parse("1 234 567.5")).toBe("1234567.5");
    expect(moneySchema.parse("1234")).toBe("1234");
    for (const bad of ["12,50", "1,2,3", "1,23,456", "1 23", "1,000 000", ",100", "1,000,"]) {
      const result = moneySchema.safeParse(bad);
      expect(result.success, bad).toBe(false);
      expect(result.error?.issues[0]?.message).toMatch(/thousands/);
    }
  });

  it("normalises money, dates and emails", () => {
    expect(moneySchema.parse("12,500.5")).toBe("12500.5");
    expect(moneySchema.safeParse("-1").success).toBe(false);
    expect(moneySchema.safeParse("1.234").success).toBe(false);
    expect(optionalDate.parse("")).toBeNull();
    expect(optionalDate.safeParse("2026-02-30").success).toBe(false);
    expect(optionalEmail.parse(" Ada@Example.COM ")).toBe("ada@example.com");
    expect(optionalEmail.safeParse("nope").success).toBe(false);
  });

  it("validates contacts and registration input", () => {
    const contact = contactSchema.parse({ firstName: " Ada ", lastName: "Lovelace", email: "" });
    expect(contact).toMatchObject({
      firstName: "Ada",
      email: null,
      lifecycleStage: "LEAD",
      tagIds: [],
    });
    expect(
      registerSchema.safeParse({
        name: "A",
        email: "a@example.com",
        password: "short",
        workspaceName: "W",
      }).success,
    ).toBe(false);
  });

  it("requires options for select custom fields", () => {
    expect(
      customFieldDefinitionSchema.safeParse({
        entityType: "CONTACT",
        label: "Tier",
        type: "SELECT",
        options: "",
      }).success,
    ).toBe(false);
    expect(
      customFieldDefinitionSchema.parse({
        entityType: "CONTACT",
        label: "Tier",
        type: "SELECT",
        options: "Gold\nSilver",
        required: "on",
      }),
    ).toMatchObject({ options: ["Gold", "Silver"], required: true });
  });
});
