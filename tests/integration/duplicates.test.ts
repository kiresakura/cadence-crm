import { beforeAll, describe, expect, it } from "vitest";

import { db } from "@/server/db";
import { ValidationError } from "@/server/errors";
import { logActivity } from "@/server/services/activities";
import { createCompany } from "@/server/services/companies";
import { createContact } from "@/server/services/contacts";
import { createDeal } from "@/server/services/deals";
import { createFieldDefinition } from "@/server/services/custom-fields";
import {
  findDuplicateGroups,
  findDuplicatesOf,
  mergeContacts,
  mergeDuplicateGroup,
} from "@/server/services/duplicates";
import { createTag } from "@/server/services/tags";
import { createTask } from "@/server/services/tasks";

import { createTestWorkspace, stageByName, type TestWorkspace } from "./helpers";

describe("duplicate detection and merge", () => {
  let ws: TestWorkspace;

  beforeAll(async () => {
    ws = await createTestWorkspace();
  });

  it("detects duplicates by email and by normalised phone", async () => {
    const one = await createContact(ws.member, {
      firstName: "Mia",
      lastName: "North",
      email: "mia@north.example",
    });
    const two = await createContact(ws.member, {
      firstName: "Mia",
      lastName: "N.",
      email: "MIA@north.example",
    });
    const three = await createContact(ws.member, {
      firstName: "Leo",
      lastName: "Park",
      phone: "+1 555 010 3000",
    });
    const four = await createContact(ws.member, {
      firstName: "Leonard",
      lastName: "Park",
      phone: "1-555-010-3000",
    });
    await createContact(ws.member, {
      firstName: "Solo",
      lastName: "Person",
      email: "solo@example.com",
    });

    const groups = await findDuplicateGroups(ws.viewer);
    const summary = groups
      .map((group) => ({
        ids: group.contacts.map((contact) => contact.id).sort(),
        reasons: group.reasons,
      }))
      .sort((a, b) => a.reasons.join().localeCompare(b.reasons.join()));
    expect(summary).toEqual([
      { ids: [one.id, two.id].sort(), reasons: ["email"] },
      { ids: [three.id, four.id].sort(), reasons: ["phone"] },
    ]);
    expect((await findDuplicatesOf(ws.viewer, one.id)).map((contact) => contact.id)).toEqual([
      two.id,
    ]);
    expect(
      await findDuplicatesOf(
        ws.viewer,
        (await createContact(ws.member, { firstName: "N", lastName: "O" })).id,
      ),
    ).toEqual([]);
  });

  it("moves activities, tasks, deals and tags to the kept contact", async () => {
    const vip = await createTag(ws.admin, { name: "vip" });
    const partner = await createTag(ws.admin, { name: "partner" });
    const company = await createCompany(ws.member, { name: "Keep Co" });
    const keep = await createContact(ws.member, {
      firstName: "Keep",
      lastName: "Me",
      email: "keep@example.com",
      tagIds: [vip.id],
      customFields: {},
    });
    const merge = await createContact(ws.member, {
      firstName: "Merge",
      lastName: "Me",
      email: "keep@example.com",
      phone: "+44 20 7946 0000",
      jobTitle: "Buyer",
      companyId: company.id,
      tagIds: [vip.id, partner.id],
    });
    await logActivity(ws.member, { type: "CALL", subject: "Intro call", contactId: merge.id });
    await createTask(ws.member, { title: "Follow up", contactId: merge.id });
    const deal = await createDeal(ws.member, {
      title: "Merge deal",
      amount: "500",
      pipelineId: ws.pipelineId,
      stageId: stageByName(ws, "Qualified").id,
      primaryContactId: merge.id,
    });

    const result = await mergeContacts(ws.member, keep.id, merge.id);
    expect(result).toMatchObject({
      id: keep.id,
      firstName: "Keep",
      phone: "+44 20 7946 0000",
      jobTitle: "Buyer",
      companyId: company.id,
    });
    expect(await db.contact.findUnique({ where: { id: merge.id } })).toBeNull();
    expect(await db.activity.count({ where: { contactId: keep.id } })).toBe(1);
    expect(await db.task.count({ where: { contactId: keep.id } })).toBe(1);
    expect((await db.deal.findUniqueOrThrow({ where: { id: deal.id } })).primaryContactId).toBe(
      keep.id,
    );
    const tags = await db.contactTag.findMany({ where: { contactId: keep.id } });
    expect(tags.map((tag) => tag.tagId).sort()).toEqual([vip.id, partner.id].sort());

    const audit = await db.auditLog.findFirstOrThrow({
      where: { entityId: keep.id, action: "contact.merged" },
    });
    expect(audit.changes).toMatchObject({
      mergedContact: { id: merge.id, name: "Merge Me" },
      moved: { activities: 1, tasks: 1, deals: 1, tags: 1 },
    });
    expect((audit.changes as { filledFields: string[] }).filledFields.sort()).toEqual([
      "companyId",
      "jobTitle",
      "phone",
    ]);
  });

  it("refuses to merge a contact into itself or as a viewer", async () => {
    const contact = await createContact(ws.member, { firstName: "Self", lastName: "Merge" });
    await expect(mergeContacts(ws.member, contact.id, contact.id)).rejects.toThrow(ValidationError);
    await expect(mergeContacts(ws.viewer, contact.id, contact.id)).rejects.toThrow(/permission/);
  });
});

describe("merging a duplicate group", () => {
  it("merges only the chosen members and records values that were not kept", async () => {
    const ws = await createTestWorkspace();
    const segment = await createFieldDefinition(ws.admin, {
      entityType: "CONTACT",
      label: "Segment",
      type: "SELECT",
      options: ["Alpha", "Beta"],
    });
    const keep = await createContact(ws.member, {
      firstName: "Jane",
      lastName: "Kept",
      email: "team@shared.example",
      phone: "0111 000 111",
      jobTitle: "Buyer",
      customFields: { [segment.key]: "Alpha" },
    });
    const merge = await createContact(ws.member, {
      firstName: "Jane",
      lastName: "Doe",
      email: "TEAM@shared.example",
      phone: "+44 20 7946 0000",
      jobTitle: "CTO",
      lifecycleStage: "CUSTOMER",
      source: "Referral",
      customFields: { [segment.key]: "Beta" },
    });
    const bystander = await createContact(ws.member, {
      firstName: "Info",
      lastName: "Desk",
      email: "team@shared.example",
      jobTitle: "Reception",
    });

    const group = (await findDuplicateGroups(ws.viewer)).find(
      (candidate) => candidate.key === "email:team@shared.example",
    );
    expect(group?.contacts.map((contact) => contact.id).sort()).toEqual(
      [keep.id, merge.id, bystander.id].sort(),
    );

    await mergeDuplicateGroup(ws.member, {
      key: "email:team@shared.example",
      keepId: keep.id,
      mergeIds: [merge.id],
    });

    expect(await db.contact.findUnique({ where: { id: merge.id } })).toBeNull();
    // The member left out of the merge is untouched.
    expect(await db.contact.findUniqueOrThrow({ where: { id: bystander.id } })).toEqual(bystander);
    const kept = await db.contact.findUniqueOrThrow({ where: { id: keep.id } });
    expect(kept).toMatchObject({ phone: "0111 000 111", jobTitle: "Buyer", source: "Referral" });

    const audit = await db.auditLog.findFirstOrThrow({
      where: { entityId: keep.id, action: "contact.merged" },
    });
    expect(audit.changes).toMatchObject({
      conflicts: {
        phone: { kept: "0111 000 111", merged: "+44 20 7946 0000" },
        jobTitle: { kept: "Buyer", merged: "CTO" },
        lifecycleStage: { kept: "LEAD", merged: "CUSTOMER" },
        [`customFields.${segment.key}`]: { kept: "Alpha", merged: "Beta" },
      },
    });

    const note = await db.activity.findFirstOrThrow({
      where: { contactId: keep.id, type: "NOTE" },
    });
    expect(note.subject).toBe("Merged from Jane Doe");
    for (const text of [
      "phone +44 20 7946 0000",
      "job title CTO",
      "lifecycle stage Customer",
      "Segment Beta",
    ]) {
      expect(note.body).toContain(text);
    }
  });

  it("only accepts contacts of this workspace that share the group's email or phone", async () => {
    const ws = await createTestWorkspace();
    const other = await createTestWorkspace();
    const a = await createContact(ws.member, {
      firstName: "A",
      lastName: "A",
      email: "x@g.example",
    });
    const b = await createContact(ws.member, {
      firstName: "B",
      lastName: "B",
      email: "x@g.example",
    });
    const unrelated = await createContact(ws.member, {
      firstName: "C",
      lastName: "C",
      email: "other@g.example",
    });
    const foreign = await createContact(other.member, {
      firstName: "F",
      lastName: "F",
      email: "x@g.example",
    });
    const key = "email:x@g.example";

    for (const input of [
      { key, keepId: a.id, mergeIds: [unrelated.id] },
      { key, keepId: a.id, mergeIds: [foreign.id] },
      { key, keepId: a.id, mergeIds: [a.id] },
      { key, keepId: a.id, mergeIds: [] },
      { key: "name:x", keepId: a.id, mergeIds: [b.id] },
      { key: "phone:123", keepId: a.id, mergeIds: [b.id] },
    ]) {
      await expect(mergeDuplicateGroup(ws.member, input)).rejects.toBeInstanceOf(ValidationError);
    }
    expect(await db.contact.count({ where: { id: { in: [a.id, b.id, unrelated.id] } } })).toBe(3);
    expect(await db.contact.findUnique({ where: { id: foreign.id } })).not.toBeNull();
    await expect(
      mergeDuplicateGroup(ws.viewer, { key, keepId: a.id, mergeIds: [b.id] }),
    ).rejects.toThrow(/permission/);
  });
});
