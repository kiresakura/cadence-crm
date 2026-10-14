import { beforeAll, describe, expect, it } from "vitest";

import { db } from "@/server/db";
import { NotFoundError, ValidationError } from "@/server/errors";
import { listTimeline, logActivity } from "@/server/services/activities";
import { listAuditLogs } from "@/server/services/audit-log";
import { createCompany, getCompany, listCompanies } from "@/server/services/companies";
import {
  createContact,
  deleteContact,
  getContact,
  listContacts,
  parseContactFilters,
  updateContact,
} from "@/server/services/contacts";
import { getDashboard } from "@/server/services/dashboard";
import { createDeal, getBoard, getDeal, moveDeal } from "@/server/services/deals";
import { findDuplicateGroups, mergeContacts } from "@/server/services/duplicates";
import { exportContactsCsv } from "@/server/services/exports";
import { changeMemberRole } from "@/server/services/members";
import { createTag } from "@/server/services/tags";
import { createTask, setTaskCompleted } from "@/server/services/tasks";

import { createTestWorkspace, stageByName, type TestWorkspace } from "./helpers";

// Workspace A must never see or touch anything that belongs to workspace B.
describe("tenant isolation", () => {
  let a: TestWorkspace;
  let b: TestWorkspace;
  let bContactId: string;
  let bCompanyId: string;
  let bDealId: string;
  let bTagId: string;

  beforeAll(async () => {
    a = await createTestWorkspace("Tenant A");
    b = await createTestWorkspace("Tenant B");
    const company = await createCompany(b.owner, { name: "B Secret Corp" });
    bCompanyId = company.id;
    const tag = await createTag(b.owner, { name: "b-only" });
    bTagId = tag.id;
    const contact = await createContact(b.owner, {
      firstName: "Bea",
      lastName: "Hidden",
      email: "shared@example.com",
      companyId: company.id,
      tagIds: [tag.id],
    });
    bContactId = contact.id;
    const deal = await createDeal(b.owner, {
      title: "B confidential deal",
      amount: "99000",
      pipelineId: b.pipelineId,
      stageId: stageByName(b, "Proposal").id,
      companyId: company.id,
    });
    bDealId = deal.id;
    await createContact(a.owner, {
      firstName: "Ann",
      lastName: "Visible",
      email: "shared@example.com",
    });
  });

  it("lists only the caller's records", async () => {
    const contacts = await listContacts(a.member, parseContactFilters({}));
    expect(contacts.items.map((contact) => contact.lastName)).toEqual(["Visible"]);
    const search = await listContacts(a.member, parseContactFilters({ q: "Hidden" }));
    expect(search.total).toBe(0);
    const companies = await listCompanies(a.member, {
      q: undefined,
      owner: undefined,
      tag: undefined,
      sort: "name",
      page: 1,
      pageSize: 25,
    });
    expect(companies.items).toHaveLength(0);
  });

  it("returns not found for another workspace's records", async () => {
    await expect(getContact(a.owner, bContactId)).rejects.toBeInstanceOf(NotFoundError);
    await expect(getCompany(a.owner, bCompanyId)).rejects.toBeInstanceOf(NotFoundError);
    await expect(getDeal(a.owner, bDealId)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("cannot update, delete or move another workspace's records", async () => {
    await expect(
      updateContact(a.owner, bContactId, { firstName: "Hacked", lastName: "Hidden" }),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(deleteContact(a.owner, bContactId)).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      moveDeal(a.owner, bDealId, { stageId: stageByName(a, "Won").id }),
    ).rejects.toBeInstanceOf(NotFoundError);
    const untouched = await db.contact.findUniqueOrThrow({ where: { id: bContactId } });
    expect(untouched.firstName).toBe("Bea");
  });

  it("rejects references to another workspace's records", async () => {
    await expect(
      createContact(a.owner, { firstName: "X", lastName: "Y", companyId: bCompanyId }),
    ).rejects.toThrow(ValidationError);
    await expect(
      createContact(a.owner, { firstName: "X", lastName: "Y", tagIds: [bTagId] }),
    ).rejects.toThrow(ValidationError);
    await expect(
      createContact(a.owner, { firstName: "X", lastName: "Y", ownerId: b.owner.userId }),
    ).rejects.toThrow(ValidationError);
    await expect(
      createDeal(a.owner, {
        title: "Wrong stage",
        amount: "10",
        pipelineId: b.pipelineId,
        stageId: stageByName(b, "Proposal").id,
      }),
    ).rejects.toThrow(ValidationError);
    await expect(
      logActivity(a.owner, { type: "NOTE", subject: "peek", contactId: bContactId }),
    ).rejects.toThrow(ValidationError);
    await expect(createTask(a.owner, { title: "peek", dealId: bDealId })).rejects.toThrow(
      ValidationError,
    );
  });

  it("keeps timelines, boards, dashboards and exports separate", async () => {
    expect(await listTimeline(a.owner, { companyId: bCompanyId })).toEqual([]);
    const board = await getBoard(a.owner, b.pipelineId);
    expect(board.pipeline?.id).toBe(a.pipelineId);
    expect(board.deals).toHaveLength(0);
    const dashboard = await getDashboard(a.owner);
    expect(dashboard.metrics.openPipeline.amount).toBe(0);
    const csv = await exportContactsCsv(a.owner, parseContactFilters({}));
    expect(csv).toContain("Visible");
    expect(csv).not.toContain("Hidden");
  });

  it("does not match duplicates or merge across workspaces", async () => {
    expect(await findDuplicateGroups(a.owner)).toEqual([]);
    const [ann] = (await listContacts(a.owner, parseContactFilters({}))).items;
    await expect(mergeContacts(a.owner, ann!.id, bContactId)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("cannot manage another workspace's members, tasks or audit log", async () => {
    const bMembership = await db.membership.findFirstOrThrow({
      where: { workspaceId: b.workspaceId, role: "VIEWER" },
    });
    await expect(
      changeMemberRole(a.owner, bMembership.id, { role: "ADMIN" }),
    ).rejects.toBeInstanceOf(NotFoundError);
    const bTask = await createTask(b.owner, { title: "B task" });
    await expect(setTaskCompleted(a.owner, bTask.id, true)).rejects.toBeInstanceOf(NotFoundError);
    const log = await listAuditLogs(a.owner, { page: 1 });
    expect(log.items.every((entry) => entry.workspaceId === a.workspaceId)).toBe(true);
  });
});
