import { beforeAll, describe, expect, it } from "vitest";

import { db } from "@/server/db";
import { ValidationError } from "@/server/errors";
import {
  createCompany,
  companyToInput,
  getCompany,
  updateCompany,
} from "@/server/services/companies";
import {
  contactToInput,
  createContact,
  getContact,
  updateContact,
} from "@/server/services/contacts";
import {
  createFieldDefinition,
  deleteFieldDefinition,
  updateFieldDefinition,
} from "@/server/services/custom-fields";
import { createDeal, dealToInput, getDeal, updateDeal } from "@/server/services/deals";
import { ownerOptions, removeMember } from "@/server/services/members";
import { createTask, updateTask } from "@/server/services/tasks";

import {
  createTestWorkspace,
  createUser,
  joinThroughInvitation,
  stageByName,
  type TestWorkspace,
} from "./helpers";

describe("updates keep values that were valid when saved", () => {
  let ws: TestWorkspace;

  beforeAll(async () => {
    ws = await createTestWorkspace();
  });

  it("keeps a select value whose option was renamed when another field changes", async () => {
    const field = await createFieldDefinition(ws.admin, {
      entityType: "CONTACT",
      label: "Segment",
      type: "SELECT",
      options: ["Alpha", "Beta"],
    });
    const contact = await createContact(ws.member, {
      firstName: "Sel",
      lastName: "Ect",
      customFields: { [field.key]: "Alpha" },
    });
    await updateFieldDefinition(ws.admin, field.id, {
      label: "Segment",
      options: ["Alpha 2", "Beta"],
    });

    // What the JSON API PATCH does: merge one field into the current values.
    const current = contactToInput(await getContact(ws.member, contact.id));
    const updated = await updateContact(ws.member, contact.id, {
      ...current,
      jobTitle: "Buyer",
    });
    expect(updated.jobTitle).toBe("Buyer");
    expect(updated.customFields).toEqual({ [field.key]: "Alpha" });

    // Choosing a value that is no longer offered is still refused.
    await expect(
      updateContact(ws.member, contact.id, { ...current, customFields: { [field.key]: "Gamma" } }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("saves records that still hold values of a deleted field", async () => {
    const field = await createFieldDefinition(ws.admin, {
      entityType: "CONTACT",
      label: "Old note",
      type: "TEXT",
    });
    const contact = await createContact(ws.member, {
      firstName: "Old",
      lastName: "Field",
      customFields: { [field.key]: "kept around" },
    });
    await deleteFieldDefinition(ws.admin, field.id);
    // What the JSON API PATCH sends: the stored values plus one change.
    const current = contactToInput(await getContact(ws.member, contact.id));
    const updated = await updateContact(ws.member, contact.id, { ...current, jobTitle: "CEO" });
    expect(updated.jobTitle).toBe("CEO");
    expect(updated.customFields).not.toHaveProperty(field.key);
  });

  it("keeps an empty value of a field that became required later", async () => {
    const contact = await createContact(ws.member, { firstName: "Late", lastName: "Rule" });
    await createFieldDefinition(ws.admin, {
      entityType: "CONTACT",
      label: "Region code",
      type: "TEXT",
      required: true,
    });
    const current = contactToInput(await getContact(ws.member, contact.id));
    const updated = await updateContact(ws.member, contact.id, { ...current, jobTitle: "CFO" });
    expect(updated.jobTitle).toBe("CFO");
  });

  it("keeps an owner who has left the workspace until the owner is changed", async () => {
    // A fresh workspace: the required field created above would block new records here.
    const ws = await createTestWorkspace();
    const leaver = await createUser("Leaver");
    const membership = await joinThroughInvitation(ws.owner, leaver, "MEMBER");
    const leaverCtx = { userId: leaver.id, workspaceId: ws.workspaceId, role: "MEMBER" as const };
    const contact = await createContact(leaverCtx, {
      firstName: "Owned",
      lastName: "Contact",
      ownerId: leaver.id,
    });
    const company = await createCompany(leaverCtx, { name: "Owned Co", ownerId: leaver.id });
    const deal = await createDeal(leaverCtx, {
      title: "Owned deal",
      amount: "100",
      pipelineId: ws.pipelineId,
      stageId: stageByName(ws, "Lead in").id,
      ownerId: leaver.id,
    });
    const task = await createTask(leaverCtx, { title: "Owned task", assigneeId: leaver.id });
    // Simulates data from before ownership was handed over on removal.
    await db.membership.delete({ where: { id: membership.id } });

    const contactInput = contactToInput(await getContact(ws.member, contact.id));
    expect(
      (await updateContact(ws.member, contact.id, { ...contactInput, jobTitle: "Kept" })).ownerId,
    ).toBe(leaver.id);
    const companyInput = companyToInput(await getCompany(ws.member, company.id));
    expect(
      (await updateCompany(ws.member, company.id, { ...companyInput, industry: "Retail" })).ownerId,
    ).toBe(leaver.id);
    const dealInput = dealToInput(await getDeal(ws.member, deal.id));
    expect((await updateDeal(ws.member, deal.id, { ...dealInput, title: "Renamed" })).ownerId).toBe(
      leaver.id,
    );
    expect(
      (await updateTask(ws.member, task.id, { title: "Renamed task", assigneeId: leaver.id }))
        .assigneeId,
    ).toBe(leaver.id);

    const outsider = await createUser("Outsider");
    await expect(
      updateContact(ws.member, contact.id, { ...contactInput, ownerId: outsider.id }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("custom field keys", () => {
  let ws: TestWorkspace;

  beforeAll(async () => {
    ws = await createTestWorkspace();
  });

  it("lets records be created after a field labelled Constructor exists", async () => {
    const field = await createFieldDefinition(ws.admin, {
      entityType: "CONTACT",
      label: "Constructor",
      type: "TEXT",
    });
    expect(field.key).toBe("field_constructor");
    const contact = await createContact(ws.member, { firstName: "Bob", lastName: "Builder" });
    expect(contact.customFields).toEqual({});
    const withValue = await createContact(ws.member, {
      firstName: "Wendy",
      lastName: "Builder",
      customFields: { field_constructor: "Scoop" },
    });
    expect(withValue.customFields).toEqual({ field_constructor: "Scoop" });
  });

  it("numbers keys of labels that normalise to the same text", async () => {
    const labels = ["預算", "產業", "備註"];
    const keys = [];
    for (const label of labels) {
      keys.push(
        (await createFieldDefinition(ws.admin, { entityType: "DEAL", label, type: "TEXT" })).key,
      );
    }
    expect(keys).toEqual(["field", "field_2", "field_3"]);
    const first = await createFieldDefinition(ws.admin, {
      entityType: "COMPANY",
      label: "預算04t",
      type: "TEXT",
    });
    const second = await createFieldDefinition(ws.admin, {
      entityType: "COMPANY",
      label: "產業04t",
      type: "TEXT",
    });
    expect([first.key, second.key]).toEqual(["field_04t", "field_04t_2"]);
  });

  it("refuses explicit keys that clash or name an object built-in", async () => {
    await createFieldDefinition(ws.admin, {
      entityType: "CONTACT",
      label: "Plan",
      key: "plan",
      type: "TEXT",
    });
    await expect(
      createFieldDefinition(ws.admin, {
        entityType: "CONTACT",
        label: "Plan",
        key: "plan",
        type: "TEXT",
      }),
    ).rejects.toThrow("A field with this key already exists.");
    await expect(
      createFieldDefinition(ws.admin, {
        entityType: "CONTACT",
        label: "Bad",
        key: "constructor",
        type: "TEXT",
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("removing a member hands over their work", () => {
  it("transfers owned records and open tasks to the chosen member", async () => {
    const ws = await createTestWorkspace();
    const leaver = await createUser("Leaver");
    const membership = await joinThroughInvitation(ws.owner, leaver, "MEMBER");
    const as = { userId: leaver.id, workspaceId: ws.workspaceId, role: "MEMBER" as const };
    const contact = await createContact(as, { firstName: "A", lastName: "B", ownerId: leaver.id });
    const company = await createCompany(as, { name: "Leaver Co", ownerId: leaver.id });
    const deal = await createDeal(as, {
      title: "Leaver deal",
      amount: "10",
      pipelineId: ws.pipelineId,
      stageId: stageByName(ws, "Lead in").id,
      ownerId: leaver.id,
    });
    const open = await createTask(as, { title: "Open", assigneeId: leaver.id });
    const done = await createTask(as, { title: "Done", assigneeId: leaver.id });
    await db.task.update({ where: { id: done.id }, data: { completedAt: new Date() } });
    const elsewhere = await createTestWorkspace();
    const otherMembership = await joinThroughInvitation(elsewhere.owner, leaver, "MEMBER");
    const elsewhereContact = await createContact(
      { userId: leaver.id, workspaceId: elsewhere.workspaceId, role: "MEMBER" },
      { firstName: "Not", lastName: "Moved", ownerId: leaver.id },
    );

    await expect(
      removeMember(ws.owner, membership.id, { transferToUserId: leaver.id }),
    ).rejects.toBeInstanceOf(ValidationError);
    const outsider = await createUser("Outsider");
    await expect(
      removeMember(ws.owner, membership.id, { transferToUserId: outsider.id }),
    ).rejects.toBeInstanceOf(ValidationError);

    await removeMember(ws.owner, membership.id, { transferToUserId: ws.admin.userId });

    expect((await db.contact.findUniqueOrThrow({ where: { id: contact.id } })).ownerId).toBe(
      ws.admin.userId,
    );
    expect((await db.company.findUniqueOrThrow({ where: { id: company.id } })).ownerId).toBe(
      ws.admin.userId,
    );
    expect((await db.deal.findUniqueOrThrow({ where: { id: deal.id } })).ownerId).toBe(
      ws.admin.userId,
    );
    expect((await db.task.findUniqueOrThrow({ where: { id: open.id } })).assigneeId).toBe(
      ws.admin.userId,
    );
    expect((await db.task.findUniqueOrThrow({ where: { id: done.id } })).assigneeId).toBe(
      leaver.id,
    );
    expect(
      (await db.contact.findUniqueOrThrow({ where: { id: elsewhereContact.id } })).ownerId,
    ).toBe(leaver.id);
    const audit = await db.auditLog.findFirstOrThrow({
      where: { workspaceId: ws.workspaceId, action: "member.removed", entityId: membership.id },
    });
    expect(audit.changes).toMatchObject({
      transferredTo: ws.admin.userId,
      transferred: { contacts: 1, companies: 1, deals: 1, openTasks: 1 },
    });

    // Without a choice, the person removing the member takes over.
    await removeMember(elsewhere.owner, otherMembership.id);
    expect(
      (await db.contact.findUniqueOrThrow({ where: { id: elsewhereContact.id } })).ownerId,
    ).toBe(elsewhere.owner.userId);
  });
});

describe("owner pickers", () => {
  it("list a departed owner of the record so saving keeps them", async () => {
    const ws = await createTestWorkspace();
    const former = await createUser("Fran Former");
    const options = await ownerOptions(ws.viewer, former.id);
    expect(options.at(-1)).toEqual({ id: former.id, label: "Fran Former (no longer a member)" });
    expect(options.filter((option) => option.id === ws.admin.userId)).toHaveLength(1);
    expect(await ownerOptions(ws.viewer, ws.admin.userId)).toEqual(await ownerOptions(ws.viewer));
    expect(await ownerOptions(ws.viewer, "missing-user")).toEqual(await ownerOptions(ws.viewer));
  });
});
