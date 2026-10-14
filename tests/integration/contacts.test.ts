import { beforeAll, describe, expect, it } from "vitest";

import { db } from "@/server/db";
import { ValidationError } from "@/server/errors";
import {
  contactOptions,
  contactToInput,
  createContact,
  deleteContact,
  getContact,
  listContacts,
  parseContactFilters,
  updateContact,
} from "@/server/services/contacts";
import {
  createCompany,
  deleteCompany,
  getCompany,
  listCompanies,
  parseCompanyFilters,
  updateCompany,
  companyOptions,
  companyToInput,
} from "@/server/services/companies";
import {
  createFieldDefinition,
  deleteFieldDefinition,
  listFieldDefinitions,
  updateFieldDefinition,
} from "@/server/services/custom-fields";
import { createTag } from "@/server/services/tags";

import { createTestWorkspace, type TestWorkspace } from "./helpers";

describe("contacts", () => {
  let ws: TestWorkspace;
  let vipTag: string;

  beforeAll(async () => {
    ws = await createTestWorkspace();
    vipTag = (await createTag(ws.admin, { name: "VIP", color: "amber" })).id;
    await createFieldDefinition(ws.admin, {
      entityType: "CONTACT",
      label: "Seats",
      type: "NUMBER",
      required: false,
    });
    await createFieldDefinition(ws.admin, {
      entityType: "CONTACT",
      label: "Tier",
      type: "SELECT",
      options: ["Gold", "Silver"],
    });
  });

  it("creates a contact with tags, normalised phone and typed custom fields", async () => {
    const company = await createCompany(ws.member, { name: "Lumen Labs", domain: "Lumen.example" });
    const contact = await createContact(ws.member, {
      firstName: "Ada",
      lastName: "Quill",
      email: "ADA@Lumen.example",
      phone: "+1 (555) 010-2000",
      companyId: company.id,
      ownerId: ws.member.userId,
      lifecycleStage: "PROSPECT",
      tagIds: [vipTag],
      customFields: { seats: "25", tier: "Gold" },
    });
    expect(contact.email).toBe("ada@lumen.example");
    expect(contact.phoneNormalized).toBe("15550102000");
    expect(contact.customFields).toEqual({ seats: 25, tier: "Gold" });

    const loaded = await getContact(ws.viewer, contact.id);
    expect(loaded.company?.name).toBe("Lumen Labs");
    expect(loaded.tags.map((link) => link.tag.name)).toEqual(["VIP"]);
    expect(contactToInput(loaded)).toMatchObject({ tagIds: [vipTag], customFields: { seats: 25 } });

    const audit = await db.auditLog.findFirstOrThrow({
      where: { entityId: contact.id, action: "contact.created" },
    });
    expect(audit.actorId).toBe(ws.member.userId);
  });

  it("rejects invalid custom field values", async () => {
    await expect(
      createContact(ws.member, { firstName: "B", lastName: "C", customFields: { tier: "Bronze" } }),
    ).rejects.toThrow(ValidationError);
    await expect(
      createContact(ws.member, { firstName: "B", lastName: "C", customFields: { nope: 1 } }),
    ).rejects.toThrow(ValidationError);
  });

  it("records a field-level diff when a contact changes", async () => {
    const contact = await createContact(ws.member, { firstName: "Gus", lastName: "Ray" });
    await updateContact(ws.member, contact.id, {
      firstName: "Gus",
      lastName: "Rayner",
      jobTitle: "CTO",
      tagIds: [vipTag],
    });
    const audit = await db.auditLog.findFirstOrThrow({
      where: { entityId: contact.id, action: "contact.updated" },
    });
    expect(audit.changes).toMatchObject({
      lastName: { from: "Ray", to: "Rayner" },
      jobTitle: { from: null, to: "CTO" },
      tagIds: { from: [], to: [vipTag] },
    });
    await updateContact(ws.member, contact.id, {
      firstName: "Gus",
      lastName: "Rayner",
      jobTitle: "CTO",
      tagIds: [vipTag],
    });
    expect(
      await db.auditLog.count({ where: { entityId: contact.id, action: "contact.updated" } }),
    ).toBe(1);
  });

  it("searches, filters, sorts and paginates", async () => {
    for (const [first, last, stage] of [
      ["Zed", "Alpha", "CUSTOMER"],
      ["Yan", "Beta", "LEAD"],
      ["Xi", "Gamma", "CUSTOMER"],
    ] as const) {
      await createContact(ws.owner, { firstName: first, lastName: last, lifecycleStage: stage });
    }
    const customers = await listContacts(
      ws.viewer,
      parseContactFilters({ lifecycle: "CUSTOMER", sort: "name" }),
    );
    expect(customers.items.map((contact) => contact.lastName)).toEqual(["Alpha", "Gamma"]);

    const multiTerm = await listContacts(ws.viewer, parseContactFilters({ q: "ada lumen" }));
    expect(multiTerm.items.map((contact) => contact.lastName)).toEqual(["Quill"]);

    const tagged = await listContacts(ws.viewer, parseContactFilters({ tag: vipTag }));
    expect(tagged.total).toBe(2);

    const mine = await listContacts(ws.member, parseContactFilters({ owner: "me" }));
    expect(mine.items.map((contact) => contact.lastName)).toEqual(["Quill"]);
    const unowned = await listContacts(ws.member, parseContactFilters({ owner: "none" }));
    expect(unowned.total).toBeGreaterThan(0);

    const page = await listContacts(ws.viewer, parseContactFilters({ pageSize: "5", page: "1" }));
    expect(page.pageSize).toBe(5);
    expect(page.pageCount).toBe(Math.ceil(page.total / 5));

    const garbage = parseContactFilters({ sort: "drop table", page: "-3", lifecycle: "nope" });
    expect(garbage).toMatchObject({ sort: "-created", page: 1, lifecycle: undefined });
    expect((await contactOptions(ws.viewer)).length).toBe(page.total);
  });

  it("deletes a contact and keeps an audit record", async () => {
    const contact = await createContact(ws.member, { firstName: "Temp", lastName: "Person" });
    await deleteContact(ws.member, contact.id);
    expect(await db.contact.findUnique({ where: { id: contact.id } })).toBeNull();
    expect(
      await db.auditLog.count({ where: { entityId: contact.id, action: "contact.deleted" } }),
    ).toBe(1);
  });
});

describe("companies", () => {
  let ws: TestWorkspace;

  beforeAll(async () => {
    ws = await createTestWorkspace();
  });

  it("supports the full lifecycle and unlinks contacts on delete", async () => {
    const company = await createCompany(ws.member, {
      name: "Harbor Freight Co",
      domain: "harbor.example",
      size: "SIZE_11_50",
      industry: "Logistics",
    });
    await expect(createCompany(ws.member, { name: "Bad", domain: "not a domain" })).rejects.toThrow(
      ValidationError,
    );
    const contact = await createContact(ws.member, {
      firstName: "Ivy",
      lastName: "Stone",
      companyId: company.id,
    });
    await updateCompany(ws.member, company.id, {
      ...companyToInput(await getCompany(ws.member, company.id)),
      industry: "Shipping",
    });
    const loaded = await getCompany(ws.viewer, company.id);
    expect(loaded.industry).toBe("Shipping");
    expect(loaded.contacts.map((person) => person.id)).toEqual([contact.id]);

    const list = await listCompanies(ws.viewer, parseCompanyFilters({ q: "harbor" }));
    expect(list.items[0]?._count.contacts).toBe(1);
    expect(await companyOptions(ws.viewer)).toEqual([
      { id: company.id, label: "Harbor Freight Co" },
    ]);

    await deleteCompany(ws.member, company.id);
    const orphan = await db.contact.findUniqueOrThrow({ where: { id: contact.id } });
    expect(orphan.companyId).toBeNull();
  });
});

describe("custom field definitions", () => {
  let ws: TestWorkspace;

  beforeAll(async () => {
    ws = await createTestWorkspace();
  });

  it("creates, updates and deletes definitions", async () => {
    const definition = await createFieldDefinition(ws.admin, {
      entityType: "DEAL",
      label: "Contract length (months)",
      type: "NUMBER",
    });
    expect(definition.key).toBe("contract_length_months");
    await expect(
      createFieldDefinition(ws.admin, {
        entityType: "DEAL",
        label: "Contract length (months)",
        type: "TEXT",
      }),
    ).rejects.toThrow(/already exists/);

    const updated = await updateFieldDefinition(ws.admin, definition.id, {
      label: "Contract term",
      required: true,
      type: "TEXT",
    });
    expect(updated).toMatchObject({ label: "Contract term", required: true, type: "NUMBER" });
    await expect(
      updateFieldDefinition(ws.admin, definition.id, { label: "x", key: "other" }),
    ).rejects.toThrow(/cannot change/);

    expect(await listFieldDefinitions(ws.viewer, "DEAL")).toHaveLength(1);
    await deleteFieldDefinition(ws.admin, definition.id);
    expect(await listFieldDefinitions(ws.viewer)).toHaveLength(0);
  });
});
