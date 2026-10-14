import { beforeAll, describe, expect, it } from "vitest";

import { db } from "@/server/db";
import { taskWindows } from "@/server/domain/tasks";
import { listCompanies, parseCompanyFilters } from "@/server/services/companies";
import { createCompany } from "@/server/services/companies";
import { createContact, listContacts, parseContactFilters } from "@/server/services/contacts";
import { getDashboard } from "@/server/services/dashboard";
import { searchContactOptions } from "@/server/services/record-options";
import { listMyTasks } from "@/server/services/tasks";

import { createTestWorkspace, type TestWorkspace } from "./helpers";

describe("search", () => {
  let ws: TestWorkspace;

  beforeAll(async () => {
    ws = await createTestWorkspace();
    await createContact(ws.member, { firstName: "Plain", lastName: "Person" });
    await createContact(ws.member, { firstName: "Under", lastName: "Score_Name" });
    await createContact(ws.member, { firstName: "Percent", lastName: "100%" });
    await createCompany(ws.member, { name: "Back\\slash Ltd" });
    await createCompany(ws.member, { name: "Normal Ltd" });
  });

  it("treats %, _ and backslash as plain characters", async () => {
    const search = async (q: string) =>
      (await listContacts(ws.viewer, parseContactFilters({ q }))).items.map((c) => c.lastName);
    expect(await search("%")).toEqual(["100%"]);
    expect(await search("_")).toEqual(["Score_Name"]);
    // As a wildcard "er_on" would match "Person"; as text it matches nothing.
    expect(await search("er_on")).toEqual([]);
    expect(
      (await listCompanies(ws.viewer, parseCompanyFilters({ q: "\\" }))).items.map((c) => c.name),
    ).toEqual(["Back\\slash Ltd"]);
    expect((await searchContactOptions(ws.viewer, "%")).map((option) => option.label)).toEqual([
      "Percent 100%",
    ]);
  });
});

describe("task views and the overdue count", () => {
  it("puts a task in Overdue or Due today, never both", async () => {
    const ws = await createTestWorkspace();
    const now = new Date("2026-10-14T06:00:00Z");
    const windows = taskWindows(now, "UTC");
    const make = (title: string, dueAt: string) =>
      db.task.create({
        data: {
          workspaceId: ws.workspaceId,
          title,
          dueAt: new Date(dueAt),
          assigneeId: ws.member.userId,
        },
      });
    await make("Earlier today", "2026-10-14T01:00:00Z");
    await make("Later today", "2026-10-14T20:00:00Z");
    await make("Yesterday", "2026-10-13T12:00:00Z");

    const titles = async (view: "overdue" | "today") =>
      (await listMyTasks(ws.member, view, windows)).items.map((task) => task.title).sort();
    expect(await titles("overdue")).toEqual(["Earlier today", "Yesterday"]);
    expect(await titles("today")).toEqual(["Later today"]);
    const { counts } = await listMyTasks(ws.member, "mine", windows);
    expect(counts.overdue + counts.today).toBe(3);
  });

  it("counts the same overdue tasks on the dashboard as the linked task view", async () => {
    const ws = await createTestWorkspace();
    const now = new Date();
    const past = new Date(now.getTime() - 60 * 60 * 1000);
    for (const assigneeId of [ws.member.userId, ws.member.userId, ws.admin.userId]) {
      await db.task.create({
        data: { workspaceId: ws.workspaceId, title: "Late", dueAt: past, assigneeId },
      });
    }
    const dashboard = await getDashboard(ws.member, { now });
    const mine = await listMyTasks(ws.member, "overdue", taskWindows(now, "UTC"));
    expect(dashboard.overdueTasks).toBe(mine.counts.overdue);
    expect(dashboard.overdueTasks).toBe(2);
  });
});
