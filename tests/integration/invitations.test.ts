import { createHash } from "node:crypto";

import { beforeAll, describe, expect, it } from "vitest";

import { login, registerUser } from "@/server/auth/service";
import { createSession, validateSessionToken } from "@/server/auth/session";
import { db } from "@/server/db";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/server/errors";
import {
  INVALID_INVITATION_MESSAGE,
  acceptInvitation,
  createInvitation,
  declineInvitation,
  findInvitation,
  listPendingInvitations,
  maskEmail,
  regenerateInvitation,
  registerWithInvitation,
  revokeInvitation,
} from "@/server/services/invitations";
import { listUserWorkspaces, switchWorkspace } from "@/server/services/workspaces";

import { TEST_PASSWORD, createTestWorkspace, createUser, uid, type TestWorkspace } from "./helpers";

function tokenOf(inviteUrl: string): string {
  const token = new URL(inviteUrl).pathname.split("/").pop();
  if (!token) throw new Error(`No token in ${inviteUrl}`);
  return token;
}

describe("workspace invitations", () => {
  let ws: TestWorkspace;

  beforeAll(async () => {
    ws = await createTestWorkspace();
  });

  it("answers identically for registered and unregistered email addresses", async () => {
    const registered = await createUser("Victoria Private-Name");
    const unregistered = `nobody-${uid()}@example.com`;

    const forRegistered = await createInvitation(ws.admin, {
      email: registered.email,
      role: "MEMBER",
    });
    const forUnregistered = await createInvitation(ws.admin, {
      email: unregistered,
      role: "MEMBER",
    });

    expect(Object.keys(forRegistered).sort()).toEqual(["expiresAt", "inviteUrl"]);
    expect(Object.keys(forUnregistered).sort()).toEqual(["expiresAt", "inviteUrl"]);
    expect(JSON.stringify(forRegistered)).not.toContain("Victoria");
    expect(forRegistered.inviteUrl).toMatch(/\/invite\/[A-Za-z0-9_-]{43}$/);
    expect(forUnregistered.inviteUrl).toMatch(/\/invite\/[A-Za-z0-9_-]{43}$/);
    expect(
      Math.abs(forRegistered.expiresAt.getTime() - forUnregistered.expiresAt.getTime()),
    ).toBeLessThan(60_000);
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    expect(forUnregistered.expiresAt.getTime() - Date.now()).toBeGreaterThan(sevenDays - 60_000);

    // Nobody gets an account or a membership just because they were invited.
    expect(await db.user.count({ where: { email: unregistered } })).toBe(0);
    expect(
      await db.membership.count({ where: { workspaceId: ws.workspaceId, userId: registered.id } }),
    ).toBe(0);
  });

  it("does not add the invitee or show the workspace to them before they accept", async () => {
    const invitee = await createUser("Invitee");
    const { inviteUrl } = await createInvitation(ws.owner, {
      email: invitee.email,
      role: "VIEWER",
    });

    expect(
      await db.membership.count({ where: { workspaceId: ws.workspaceId, userId: invitee.id } }),
    ).toBe(0);
    expect((await listUserWorkspaces(invitee.id)).map((w) => w.id)).not.toContain(ws.workspaceId);

    const { workspaceId } = await acceptInvitation(invitee.id, tokenOf(inviteUrl));
    expect(workspaceId).toBe(ws.workspaceId);
    const membership = await db.membership.findUniqueOrThrow({
      where: { workspaceId_userId: { workspaceId: ws.workspaceId, userId: invitee.id } },
    });
    expect(membership.role).toBe("VIEWER");
    expect((await listUserWorkspaces(invitee.id)).map((w) => w.id)).toContain(ws.workspaceId);

    const invitation = await db.invitation.findFirstOrThrow({
      where: { workspaceId: ws.workspaceId, email: invitee.email },
    });
    expect(invitation.acceptedAt).not.toBeNull();
    expect(invitation.acceptedById).toBe(invitee.id);
    const audit = await db.auditLog.findFirstOrThrow({
      where: { workspaceId: ws.workspaceId, action: "member.joined", entityId: membership.id },
    });
    expect(audit.actorId).toBe(invitee.id);
  });

  it("refuses an invitation signed in with a different email address", async () => {
    const intended = `intended-${uid()}@example.com`;
    const someoneElse = await createUser("Someone Else");
    const { inviteUrl } = await createInvitation(ws.owner, { email: intended, role: "MEMBER" });

    await expect(acceptInvitation(someoneElse.id, tokenOf(inviteUrl))).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(declineInvitation(someoneElse.id, tokenOf(inviteUrl))).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    expect(
      await db.membership.count({ where: { workspaceId: ws.workspaceId, userId: someoneElse.id } }),
    ).toBe(0);
    expect(await findInvitation(tokenOf(inviteUrl))).not.toBeNull();
  });

  it("rejects expired, revoked, used and unknown links with the same message", async () => {
    const invitee = await createUser("Many Links");

    const expired = await createInvitation(ws.owner, { email: invitee.email, role: "MEMBER" });
    await db.invitation.updateMany({
      where: { tokenHash: createHash("sha256").update(tokenOf(expired.inviteUrl)).digest("hex") },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const revoked = await createInvitation(ws.owner, { email: invitee.email, role: "MEMBER" });
    const pending = await listPendingInvitations(ws.owner);
    await revokeInvitation(ws.owner, pending.find((i) => i.email === invitee.email)!.id);

    const used = await createInvitation(ws.owner, { email: invitee.email, role: "MEMBER" });
    await acceptInvitation(invitee.id, tokenOf(used.inviteUrl));

    for (const token of [
      tokenOf(expired.inviteUrl),
      tokenOf(revoked.inviteUrl),
      tokenOf(used.inviteUrl),
      "not-a-real-token",
      "x".repeat(500),
    ]) {
      expect(await findInvitation(token)).toBeNull();
      await expect(acceptInvitation(invitee.id, token)).rejects.toThrow(INVALID_INVITATION_MESSAGE);
      await expect(
        registerWithInvitation({
          token,
          name: "Late",
          password: "a-long-enough-password",
          timezone: "UTC",
        }),
      ).rejects.toThrow(INVALID_INVITATION_MESSAGE);
    }
  });

  it("keeps the owner role for owners", async () => {
    await expect(
      createInvitation(ws.admin, { email: `own-${uid()}@example.com`, role: "OWNER" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      createInvitation(ws.member, { email: `m-${uid()}@example.com`, role: "VIEWER" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      createInvitation(ws.owner, { email: "someone@demo.local", role: "VIEWER" }),
    ).rejects.toBeInstanceOf(ValidationError);

    const { inviteUrl } = await createInvitation(ws.owner, {
      email: `co-owner-${uid()}@example.com`,
      role: "OWNER",
    });
    const ownerInvite = (await listPendingInvitations(ws.owner)).find(
      (i) => i.role === "OWNER" && inviteUrl,
    )!;
    // An admin cannot mint a fresh owner link for themselves.
    await expect(regenerateInvitation(ws.admin, ownerInvite.id)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it("never stores the raw token", async () => {
    const { inviteUrl } = await createInvitation(ws.owner, {
      email: `raw-${uid()}@example.com`,
      role: "MEMBER",
    });
    const token = tokenOf(inviteUrl);
    const rows = await db.$queryRaw<Array<{ row: string }>>`
      SELECT row_to_json(i)::text AS row FROM "Invitation" i`;
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.some(({ row }) => row.includes(token))).toBe(false);
    const stored = await db.invitation.findUnique({
      where: { tokenHash: createHash("sha256").update(token).digest("hex") },
    });
    expect(stored).not.toBeNull();
  });

  it("replaces an unused invitation when the same email is invited again", async () => {
    const email = `again-${uid()}@example.com`;
    const first = await createInvitation(ws.owner, { email, role: "MEMBER" });
    const second = await createInvitation(ws.owner, { email: email.toUpperCase(), role: "ADMIN" });
    expect(await findInvitation(tokenOf(first.inviteUrl))).toBeNull();
    expect(await findInvitation(tokenOf(second.inviteUrl))).toMatchObject({ email, role: "ADMIN" });
    expect((await listPendingInvitations(ws.owner)).filter((i) => i.email === email)).toHaveLength(
      1,
    );
  });

  it("says when the person is already a member", async () => {
    const admin = await db.user.findUniqueOrThrow({ where: { id: ws.admin.userId } });
    await expect(
      createInvitation(ws.owner, { email: admin.email, role: "MEMBER" }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("regenerates and revokes pending links", async () => {
    const email = `regen-${uid()}@example.com`;
    const original = await createInvitation(ws.admin, { email, role: "MEMBER" });
    const pending = (await listPendingInvitations(ws.admin)).find((i) => i.email === email)!;
    expect(pending).toMatchObject({ role: "MEMBER", invitedBy: "admin" });

    const fresh = await regenerateInvitation(ws.admin, pending.id);
    expect(fresh.inviteUrl).not.toBe(original.inviteUrl);
    expect(await findInvitation(tokenOf(original.inviteUrl))).toBeNull();
    expect(await findInvitation(tokenOf(fresh.inviteUrl))).not.toBeNull();

    await revokeInvitation(ws.admin, pending.id);
    expect(await findInvitation(tokenOf(fresh.inviteUrl))).toBeNull();
    expect((await listPendingInvitations(ws.admin)).some((i) => i.email === email)).toBe(false);

    const stranger = await createTestWorkspace();
    await expect(revokeInvitation(stranger.owner, pending.id)).rejects.toBeInstanceOf(
      NotFoundError,
    );
    const actions = await db.auditLog.findMany({
      where: { workspaceId: ws.workspaceId, entityType: "invitation", entityId: pending.id },
      select: { action: true },
    });
    expect(actions.map((a) => a.action).sort()).toEqual([
      "invitation.created",
      "invitation.regenerated",
      "invitation.revoked",
    ]);
  });

  it("creates an account for the invited email and joins without a new workspace", async () => {
    const email = `fresh-${uid()}@example.com`;
    const { inviteUrl } = await createInvitation(ws.admin, { email, role: "MEMBER" });

    const session = await registerWithInvitation({
      token: tokenOf(inviteUrl),
      name: "Fresh Person",
      // Any email sent along is ignored: the account always gets the invited address.
      email: "attacker@example.com",
      password: "a-long-enough-password",
      timezone: "Asia/Taipei",
    });
    expect(session.workspaceId).toBe(ws.workspaceId);
    const user = await db.user.findUniqueOrThrow({ where: { id: session.userId } });
    expect(user).toMatchObject({ email, name: "Fresh Person", timezone: "Asia/Taipei" });
    const memberships = await db.membership.findMany({ where: { userId: user.id } });
    expect(memberships).toEqual([expect.objectContaining({ workspaceId: ws.workspaceId })]);
    expect(memberships[0]!.role).toBe("MEMBER");
    expect(await db.user.count({ where: { email: "attacker@example.com" } })).toBe(0);
    expect((await validateSessionToken(db, session.token))?.workspaceId).toBe(ws.workspaceId);

    await expect(
      registerWithInvitation({
        token: tokenOf(inviteUrl),
        name: "Again",
        password: "a-long-enough-password",
      }),
    ).rejects.toThrow(INVALID_INVITATION_MESSAGE);
  });

  it("asks people who already have an account to sign in instead", async () => {
    const existing = await createUser("Existing");
    const { inviteUrl } = await createInvitation(ws.admin, {
      email: existing.email,
      role: "MEMBER",
    });
    await expect(
      registerWithInvitation({
        token: tokenOf(inviteUrl),
        name: "Existing",
        password: "a-long-enough-password",
      }),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(await findInvitation(tokenOf(inviteUrl))).not.toBeNull();
  });

  it("lets the invitee decline, which retires the link", async () => {
    const invitee = await createUser("Decliner");
    const { inviteUrl } = await createInvitation(ws.owner, {
      email: invitee.email,
      role: "MEMBER",
    });
    await declineInvitation(invitee.id, tokenOf(inviteUrl));
    expect(await findInvitation(tokenOf(inviteUrl))).toBeNull();
    expect(
      await db.membership.count({ where: { workspaceId: ws.workspaceId, userId: invitee.id } }),
    ).toBe(0);
  });

  it("stops an account squatter from reaching the employer's workspace", async () => {
    // 1. The attacker signs up first with the future employee's address (no email check yet).
    const victimEmail = `new.hire.${uid()}@example.com`;
    const attacker = await registerUser({
      name: "Squatter",
      email: victimEmail,
      password: "attacker-password-1",
      workspaceName: "Attacker Inc",
      timezone: "UTC",
    });

    // 2. The employer invites that address. The link goes to the real person, not the attacker.
    const employer = await createTestWorkspace("Employer");
    const response = await createInvitation(employer.owner, { email: victimEmail, role: "MEMBER" });
    expect(Object.keys(response).sort()).toEqual(["expiresAt", "inviteUrl"]);

    // 3. The attacker signs in: no membership, the workspace is not listed and cannot be selected.
    const session = await login({ email: victimEmail, password: "attacker-password-1" });
    expect(
      await db.membership.count({
        where: { workspaceId: employer.workspaceId, userId: attacker.userId },
      }),
    ).toBe(0);
    expect((await listUserWorkspaces(attacker.userId)).map((w) => w.id)).toEqual([
      attacker.workspaceId,
    ]);
    const validated = (await validateSessionToken(db, session.token))!;
    await expect(
      switchWorkspace(validated.id, attacker.userId, employer.workspaceId),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect((await validateSessionToken(db, session.token))?.workspaceId).toBe(attacker.workspaceId);
  });

  it("masks email addresses for the wrong-account notice", () => {
    expect(maskEmail("jane.doe@example.com")).toBe("j•••@e•••.com");
    expect(maskEmail("a@b.co")).toBe("a•••@b•••.co");
  });

  it("is reachable through a session once accepted", async () => {
    const invitee = await createUser("Switcher");
    const { inviteUrl } = await createInvitation(ws.owner, {
      email: invitee.email,
      role: "MEMBER",
    });
    const { token } = await createSession(db, { userId: invitee.id, workspaceId: null });
    const session = (await validateSessionToken(db, token))!;
    await expect(switchWorkspace(session.id, invitee.id, ws.workspaceId)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await acceptInvitation(invitee.id, tokenOf(inviteUrl));
    await switchWorkspace(session.id, invitee.id, ws.workspaceId);
    expect((await validateSessionToken(db, token))?.workspaceId).toBe(ws.workspaceId);
    await expect(login({ email: invitee.email, password: TEST_PASSWORD })).resolves.toBeDefined();
  });
});
