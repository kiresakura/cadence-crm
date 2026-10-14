import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { login, registerUser } from "@/server/auth/service";
import { createSession, deleteSessionByToken, validateSessionToken } from "@/server/auth/session";
import { db } from "@/server/db";
import {
  AppError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@/server/errors";
import {
  deleteActivity,
  listRecentActivities,
  listTimeline,
  logActivity,
} from "@/server/services/activities";
import { listAuditLogs, parseAuditFilters } from "@/server/services/audit-log";
import { createCompany } from "@/server/services/companies";
import { createContact } from "@/server/services/contacts";
import { getDashboard } from "@/server/services/dashboard";
import { createDeal, moveDeal } from "@/server/services/deals";
import { createInvitation } from "@/server/services/invitations";
import { listMembers, memberOptions, removeMember } from "@/server/services/members";
import { createTag, deleteTag, listTags, updateTag } from "@/server/services/tags";
import {
  createTask,
  deleteTask,
  listMyTasks,
  listTasksFor,
  setTaskCompleted,
  updateTask,
} from "@/server/services/tasks";
import { createWorkspace, listUserWorkspaces, switchWorkspace } from "@/server/services/workspaces";
import { taskWindows } from "@/server/domain/tasks";

import {
  TEST_PASSWORD,
  createTestWorkspace,
  createUser,
  joinThroughInvitation,
  stageByName,
  uid,
  type TestWorkspace,
} from "./helpers";

describe("registration and sign-in", () => {
  const originalAppEnv = process.env.APP_ENV;
  afterEach(() => {
    process.env.APP_ENV = originalAppEnv;
  });

  it("registers a user with a workspace, owner role and default pipeline", async () => {
    const email = `founder-${uid()}@example.com`;
    const session = await registerUser({
      name: "Founder",
      email,
      password: "a-long-password",
      workspaceName: "Acme Trial",
      timezone: "Asia/Taipei",
    });
    const membership = await db.membership.findFirstOrThrow({ where: { userId: session.userId } });
    expect(membership.role).toBe("OWNER");
    const stages = await db.stage.count({ where: { workspaceId: session.workspaceId! } });
    expect(stages).toBe(6);
    const validated = await validateSessionToken(db, session.token);
    expect(validated?.user).toMatchObject({ email, timezone: "Asia/Taipei" });

    await expect(
      registerUser({ name: "Again", email, password: "a-long-password", workspaceName: "X" }),
    ).rejects.toBeInstanceOf(ConflictError);
    await expect(
      registerUser({
        name: "Demo",
        email: "x@demo.local",
        password: "a-long-password",
        workspaceName: "X",
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("signs in with the right password only", async () => {
    const user = await createUser("Signer");
    const session = await login({ email: user.email.toUpperCase(), password: TEST_PASSWORD });
    expect(session.userId).toBe(user.id);
    await expect(login({ email: user.email, password: "wrong-password" })).rejects.toThrow(
      "Invalid email or password.",
    );
    await expect(login({ email: `nobody-${uid()}@example.com`, password: "x" })).rejects.toThrow(
      "Invalid email or password.",
    );
  });

  it("rate limits repeated failures for one email", async () => {
    const email = `limited-${uid()}@example.com`;
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await expect(login({ email, password: "bad" })).rejects.toThrow("Invalid email or password.");
    }
    await expect(login({ email, password: "bad" })).rejects.toThrow(/Too many/);
  });

  it("rejects demo accounts in production", async () => {
    const demo = await db.user.create({
      data: {
        email: `demo-${uid()}@demo.local`,
        name: "Demo",
        passwordHash: (await createUser()).passwordHash,
      },
    });
    process.env.APP_ENV = "demo";
    await expect(login({ email: demo.email, password: TEST_PASSWORD })).resolves.toMatchObject({
      userId: demo.id,
    });
    process.env.APP_ENV = "production";
    await expect(login({ email: demo.email, password: TEST_PASSWORD })).rejects.toBeInstanceOf(
      AppError,
    );
  });

  it("expires and deletes sessions", async () => {
    const user = await createUser();
    const { token } = await createSession(db, {
      userId: user.id,
      workspaceId: null,
      now: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000),
    });
    expect(await validateSessionToken(db, token)).toBeNull();
    const fresh = await createSession(db, { userId: user.id, workspaceId: null });
    expect(await validateSessionToken(db, fresh.token)).not.toBeNull();
    await deleteSessionByToken(db, fresh.token);
    expect(await validateSessionToken(db, fresh.token)).toBeNull();
    expect(await validateSessionToken(db, "")).toBeNull();
  });
});

describe("workspaces and members", () => {
  it("lets a user create and switch between workspaces they belong to", async () => {
    const user = await createUser();
    const first = await createWorkspace(user.id, { name: "First" });
    const second = await createWorkspace(user.id, { name: "Second" });
    expect((await listUserWorkspaces(user.id)).map((w) => w.name)).toEqual(["First", "Second"]);
    const { token } = await createSession(db, { userId: user.id, workspaceId: first.id });
    const session = (await validateSessionToken(db, token))!;
    await switchWorkspace(session.id, user.id, second.id);
    expect((await validateSessionToken(db, token))?.workspaceId).toBe(second.id);
    const stranger = await createTestWorkspace();
    await expect(switchWorkspace(session.id, user.id, stranger.workspaceId)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it("adds people who accept an invitation and revokes access on removal", async () => {
    const ws = await createTestWorkspace();
    const outsider = await createUser("Outsider");
    const membership = await joinThroughInvitation(ws.owner, outsider, "VIEWER");
    expect(membership.role).toBe("VIEWER");
    await expect(
      createInvitation(ws.owner, { email: outsider.email, role: "VIEWER" }),
    ).rejects.toBeInstanceOf(ConflictError);
    await expect(
      createInvitation(ws.owner, { email: "someone@demo.local", role: "VIEWER" }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect((await listMembers(ws.viewer)).length).toBe(5);
    expect((await memberOptions(ws.viewer)).map((m) => m.label)).toContain("Outsider");

    const { token } = await createSession(db, { userId: outsider.id, workspaceId: ws.workspaceId });
    await removeMember(ws.owner, membership.id);
    expect((await validateSessionToken(db, token))?.workspaceId).toBeNull();
  });
});

describe("activities, tasks and tags", () => {
  let ws: TestWorkspace;

  beforeAll(async () => {
    ws = await createTestWorkspace();
  });

  it("builds timelines for contacts, companies and deals", async () => {
    const company = await createCompany(ws.member, { name: "Timeline Inc" });
    const contact = await createContact(ws.member, {
      firstName: "Tia",
      lastName: "Line",
      companyId: company.id,
    });
    const deal = await createDeal(ws.member, {
      title: "Timeline deal",
      amount: "10",
      pipelineId: ws.pipelineId,
      stageId: stageByName(ws, "Lead in").id,
      companyId: company.id,
    });
    await logActivity(
      ws.member,
      { type: "CALL", subject: "Discovery", contactId: contact.id, occurredAt: "2026-10-01T10:00" },
      { timeZone: "Asia/Taipei" },
    );
    await logActivity(ws.member, { type: "MEETING", subject: "Demo", dealId: deal.id });
    const note = await logActivity(ws.member, {
      type: "NOTE",
      subject: "Company note",
      companyId: company.id,
    });
    await expect(
      logActivity(ws.member, { type: "NOTE", subject: "Orphan" }),
    ).rejects.toBeInstanceOf(ValidationError);

    const contactTimeline = await listTimeline(ws.viewer, { contactId: contact.id });
    expect(contactTimeline.map((a) => a.subject)).toEqual(["Discovery"]);
    expect(contactTimeline[0]?.occurredAt.toISOString()).toBe("2026-10-01T02:00:00.000Z");
    const companyTimeline = await listTimeline(ws.viewer, { companyId: company.id });
    expect(companyTimeline.map((a) => a.subject).sort()).toEqual([
      "Company note",
      "Demo",
      "Discovery",
    ]);
    expect((await listTimeline(ws.viewer, { dealId: deal.id })).map((a) => a.subject)).toEqual([
      "Demo",
    ]);
    expect((await listRecentActivities(ws.viewer, 2)).length).toBe(2);

    await deleteActivity(ws.member, note.id);
    await expect(deleteActivity(ws.member, note.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("groups my tasks into overdue, today and upcoming views", async () => {
    const now = new Date("2026-10-14T03:00:00Z");
    const windows = taskWindows(now, "UTC");
    const contact = await createContact(ws.member, { firstName: "Task", lastName: "Target" });
    const mk = (title: string, dueAt: string | null) =>
      createTask(ws.member, { title, dueAt, contactId: contact.id, priority: "HIGH" });
    const overdue = await mk("Overdue", "2026-10-13T09:00");
    await mk("Later today", "2026-10-14T18:00");
    await mk("Next week", "2026-10-18T09:00");
    await mk("Someday", null);
    await createTask(ws.admin, { title: "Someone else's", dueAt: "2026-10-14T09:00" });

    const today = await listMyTasks(ws.member, "today", windows);
    expect(today.items.map((task) => task.title)).toEqual(["Later today"]);
    expect(today.counts).toEqual({ mine: 4, overdue: 1, today: 1, upcoming: 1 });
    expect((await listMyTasks(ws.member, "overdue", windows)).items.map((t) => t.title)).toEqual([
      "Overdue",
    ]);
    expect((await listMyTasks(ws.member, "upcoming", windows)).items.map((t) => t.title)).toEqual([
      "Next week",
    ]);

    await setTaskCompleted(ws.member, overdue.id, true, now);
    await setTaskCompleted(ws.member, overdue.id, true, now);
    expect((await listMyTasks(ws.member, "completed", windows)).items.map((t) => t.title)).toEqual([
      "Overdue",
    ]);
    await setTaskCompleted(ws.member, overdue.id, false);
    expect(
      await db.auditLog.count({ where: { entityId: overdue.id, action: "task.completed" } }),
    ).toBe(1);

    await updateTask(ws.member, overdue.id, {
      title: "Renamed",
      dueAt: null,
      contactId: contact.id,
    });
    expect(
      (await listTasksFor(ws.viewer, { contactId: contact.id })).map((t) => t.title),
    ).toContain("Renamed");
    await expect(
      createTask(ws.member, { title: "Bad assignee", assigneeId: "nobody" }),
    ).rejects.toBeInstanceOf(ValidationError);
    await deleteTask(ws.member, overdue.id);
  });

  it("manages the tag vocabulary", async () => {
    const tag = await createTag(ws.admin, { name: "Hot", color: "red" });
    await expect(createTag(ws.admin, { name: "hot" })).rejects.toBeInstanceOf(ConflictError);
    await updateTag(ws.admin, tag.id, { name: "Hot lead", color: "amber" });
    expect((await listTags(ws.viewer)).map((t) => t.name)).toContain("Hot lead");
    await deleteTag(ws.admin, tag.id);
    expect((await listTags(ws.viewer)).map((t) => t.name)).not.toContain("Hot lead");
  });
});

describe("dashboard and audit log", () => {
  it("reflects deals moving through the pipeline", async () => {
    const ws = await createTestWorkspace();
    const deal = await createDeal(ws.member, {
      title: "Dashboard deal",
      amount: "10000",
      pipelineId: ws.pipelineId,
      stageId: stageByName(ws, "Lead in").id,
      expectedCloseDate: new Date().toISOString().slice(0, 10),
    });
    await createDeal(ws.member, {
      title: "Euro deal",
      amount: "999",
      currency: "EUR",
      pipelineId: ws.pipelineId,
      stageId: stageByName(ws, "Lead in").id,
    });
    let dashboard = await getDashboard(ws.viewer);
    expect(dashboard.metrics.openPipeline).toEqual({ amount: 10000, count: 1 });
    expect(dashboard.metrics.weightedForecast).toBe(1000);
    expect(dashboard.metrics.closingThisMonth.count).toBe(1);
    expect(dashboard.metrics.excludedOtherCurrency).toBe(1);

    await moveDeal(ws.member, deal.id, { stageId: stageByName(ws, "Proposal").id });
    dashboard = await getDashboard(ws.viewer);
    expect(dashboard.metrics.weightedForecast).toBe(5000);

    await moveDeal(ws.member, deal.id, { stageId: stageByName(ws, "Won").id });
    dashboard = await getDashboard(ws.viewer);
    expect(dashboard.metrics.winRate90d).toEqual({ won: 1, lost: 0, rate: 1 });
    expect(dashboard.metrics.wonByMonth.at(-1)?.amount).toBe(10000);
    expect(dashboard.chartPipeline?.id).toBe(ws.pipelineId);

    const log = await listAuditLogs(ws.admin, parseAuditFilters({ entity: "deal" }));
    expect(log.items.map((entry) => entry.action)).toEqual([
      "deal.stage_changed",
      "deal.stage_changed",
      "deal.created",
      "deal.created",
    ]);
  });
});
