import { describe, expect, it } from "vitest";

import { db } from "@/server/db";
import { logActivity } from "@/server/services/activities";
import { createCompany, deleteCompany } from "@/server/services/companies";
import { createContact, deleteContact } from "@/server/services/contacts";
import { createDeal, deleteDeal } from "@/server/services/deals";
import { deletionImpact } from "@/server/services/deletion";
import { createTask } from "@/server/services/tasks";

import { createTestWorkspace, stageByName } from "./helpers";

async function arrange() {
  const ws = await createTestWorkspace();
  const company = await createCompany(ws.member, { name: "Linked Co" });
  const contact = await createContact(ws.member, {
    firstName: "Lin",
    lastName: "Ked",
    companyId: company.id,
  });
  const deal = await createDeal(ws.member, {
    title: "Linked deal",
    amount: "10",
    pipelineId: ws.pipelineId,
    stageId: stageByName(ws, "Lead in").id,
    companyId: company.id,
    primaryContactId: contact.id,
  });
  const note = (links: Record<string, string>) =>
    logActivity(ws.member, { type: "NOTE", subject: "Note", ...links }, { timeZone: "UTC" });
  const task = (links: Record<string, string>) =>
    createTask(ws.member, { title: "Task", assigneeId: ws.member.userId, ...links });
  return { ws, company, contact, deal, note, task };
}

const exists = {
  activity: async (id: string) => db.activity.findUnique({ where: { id } }),
  task: async (id: string) => db.task.findUnique({ where: { id } }),
};

describe("deleting records with activities and tasks", () => {
  it("removes what only belonged to a contact and keeps shared items", async () => {
    const { ws, company, contact, deal, note, task } = await arrange();
    const own = await note({ contactId: contact.id });
    const shared = await note({ contactId: contact.id, companyId: company.id });
    const ownTask = await task({ contactId: contact.id });
    const sharedTask = await task({ contactId: contact.id, dealId: deal.id });
    const standalone = await task({});

    expect(await deletionImpact(ws.viewer, "contact", contact.id)).toEqual({
      activities: 1,
      tasks: 1,
    });
    await deleteContact(ws.member, contact.id);

    expect(await exists.activity(own.id)).toBeNull();
    expect(await exists.task(ownTask.id)).toBeNull();
    expect(await exists.activity(shared.id)).toMatchObject({
      contactId: null,
      companyId: company.id,
    });
    expect(await exists.task(sharedTask.id)).toMatchObject({ contactId: null, dealId: deal.id });
    expect(await exists.task(standalone.id)).not.toBeNull();
    const audit = await db.auditLog.findFirstOrThrow({
      where: { entityId: contact.id, action: "contact.deleted" },
    });
    expect(audit.changes).toMatchObject({ removed: { activities: 1, tasks: 1 } });
  });

  it("does the same for companies and deals", async () => {
    const { ws, company, contact, deal, note, task } = await arrange();
    const companyOnly = await note({ companyId: company.id });
    const dealOnly = await note({ dealId: deal.id });
    const dealTask = await task({ dealId: deal.id });
    const both = await note({ companyId: company.id, dealId: deal.id });

    expect(await deletionImpact(ws.viewer, "deal", deal.id)).toEqual({ activities: 1, tasks: 1 });
    await deleteDeal(ws.member, deal.id);
    expect(await exists.activity(dealOnly.id)).toBeNull();
    expect(await exists.task(dealTask.id)).toBeNull();
    expect(await exists.activity(both.id)).toMatchObject({ dealId: null, companyId: company.id });

    // `both` now only belongs to the company.
    expect(await deletionImpact(ws.viewer, "company", company.id)).toEqual({
      activities: 2,
      tasks: 0,
    });
    await deleteCompany(ws.member, company.id);
    expect(await exists.activity(companyOnly.id)).toBeNull();
    expect(await exists.activity(both.id)).toBeNull();
    expect(await db.contact.findUniqueOrThrow({ where: { id: contact.id } })).toMatchObject({
      companyId: null,
    });
  });

  it("never stores an activity without a contact, company or deal", async () => {
    const { ws } = await arrange();
    await expect(
      db.activity.create({ data: { workspaceId: ws.workspaceId, type: "NOTE", subject: "Lost" } }),
    ).rejects.toThrow();
  });

  it("only reports on records of the caller's workspace", async () => {
    const { contact } = await arrange();
    const other = await createTestWorkspace();
    await expect(deletionImpact(other.viewer, "contact", contact.id)).rejects.toThrow(/not found/);
  });
});
