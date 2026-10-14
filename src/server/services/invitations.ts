import { createHash, randomBytes } from "node:crypto";

import type { Role } from "@/generated/prisma/enums";

import { recordAudit } from "../audit";
import { hashPassword } from "../auth/password";
import { createSession } from "../auth/session";
import { isValidTimeZone } from "../domain/tasks";
import { db, type DbClient } from "../db";
import { getAppUrl, isDemoEmail } from "../env";
import { AppError, ConflictError, ForbiddenError, ValidationError, parseInput } from "../errors";
import { assertCan, type Ctx } from "../permissions";
import { invitationRegisterSchema, invitationSchema } from "../validation/schemas";
import { notFoundUnless } from "./guards";

export const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Shown for unknown, expired, revoked and used links alike, so a link reveals nothing. */
export const INVALID_INVITATION_MESSAGE = "This invitation link is invalid or has expired.";

const MAX_TOKEN_LENGTH = 200;

export function hashInvitationToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function newToken() {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashInvitationToken(token) };
}

function inviteUrl(token: string): string {
  return `${getAppUrl()}/invite/${token}`;
}

function invalidInvitation(): AppError {
  return new AppError("NOT_FOUND", INVALID_INVITATION_MESSAGE);
}

function assertCanGrant(ctx: Ctx, role: Role) {
  if (role === "OWNER" && ctx.role !== "OWNER") {
    throw new ForbiddenError("Only owners can grant the owner role.");
  }
}

/** "jane.doe@example.com" -> "j•••@e•••.com", for telling someone which account to use. */
export function maskEmail(email: string): string {
  const [local = "", domain = ""] = email.split("@");
  const dot = domain.lastIndexOf(".");
  const host = dot > 0 ? domain.slice(0, dot) : domain;
  const tld = dot > 0 ? domain.slice(dot) : "";
  return `${local.slice(0, 1)}•••@${host.slice(0, 1)}•••${tld}`;
}

/** A pending (not used, not revoked, not expired) invitation for this token, or null. */
async function findPending(client: DbClient, token: string, now = new Date()) {
  if (!token || token.length > MAX_TOKEN_LENGTH) return null;
  const invitation = await client.invitation.findUnique({
    where: { tokenHash: hashInvitationToken(token) },
    include: { workspace: { select: { id: true, name: true } } },
  });
  if (!invitation || invitation.acceptedAt || invitation.revokedAt) return null;
  if (invitation.expiresAt.getTime() <= now.getTime()) return null;
  return invitation;
}

/**
 * Creates a one-time invitation link. The answer is the same whether or not the address
 * already has an account: no name, no account flag, and no extra work for either case.
 */
export async function createInvitation(
  ctx: Ctx,
  rawInput: unknown,
): Promise<{ inviteUrl: string; expiresAt: Date }> {
  assertCan(ctx, "members:manage");
  const input = parseInput(invitationSchema, rawInput);
  assertCanGrant(ctx, input.role);
  if (isDemoEmail(input.email)) {
    throw ValidationError.forField("email", "This email domain is reserved for demo accounts.");
  }

  const { token, tokenHash } = newToken();
  const expiresAt = new Date(Date.now() + INVITATION_TTL_MS);
  await db.$transaction(async (tx) => {
    // Members are already listed on the members page, so saying so reveals nothing new.
    const member = await tx.membership.findFirst({
      where: { workspaceId: ctx.workspaceId, user: { email: input.email } },
      select: { id: true },
    });
    if (member) {
      throw new ConflictError("This person is already a member.", {
        email: ["Already a member of this workspace."],
      });
    }
    // A new link replaces any unused one for the same address.
    await tx.invitation.updateMany({
      where: {
        workspaceId: ctx.workspaceId,
        email: input.email,
        acceptedAt: null,
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    });
    const invitation = await tx.invitation.create({
      data: {
        workspaceId: ctx.workspaceId,
        email: input.email,
        role: input.role,
        tokenHash,
        invitedById: ctx.userId,
        expiresAt,
      },
    });
    await recordAudit(tx, ctx, {
      action: "invitation.created",
      entityType: "invitation",
      entityId: invitation.id,
      changes: { email: invitation.email, role: invitation.role },
    });
  });
  return { inviteUrl: inviteUrl(token), expiresAt };
}

export async function listPendingInvitations(ctx: Ctx, now = new Date()) {
  assertCan(ctx, "members:manage");
  const invitations = await db.invitation.findMany({
    where: {
      workspaceId: ctx.workspaceId,
      acceptedAt: null,
      revokedAt: null,
      expiresAt: { gt: now },
    },
    include: { invitedBy: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });
  return invitations.map((invitation) => ({
    id: invitation.id,
    email: invitation.email,
    role: invitation.role,
    invitedBy: invitation.invitedBy.name,
    expiresAt: invitation.expiresAt,
  }));
}

async function findPendingInWorkspace(tx: DbClient, ctx: Ctx, invitationId: string) {
  return notFoundUnless(
    await tx.invitation.findFirst({
      where: {
        id: invitationId,
        workspaceId: ctx.workspaceId,
        acceptedAt: null,
        revokedAt: null,
      },
    }),
    "Invitation",
  );
}

/** Issues a new link for a pending invitation; the previous link stops working. */
export async function regenerateInvitation(
  ctx: Ctx,
  invitationId: string,
): Promise<{ inviteUrl: string; expiresAt: Date }> {
  assertCan(ctx, "members:manage");
  const { token, tokenHash } = newToken();
  const expiresAt = new Date(Date.now() + INVITATION_TTL_MS);
  await db.$transaction(async (tx) => {
    const invitation = await findPendingInWorkspace(tx, ctx, invitationId);
    assertCanGrant(ctx, invitation.role);
    await tx.invitation.update({ where: { id: invitation.id }, data: { tokenHash, expiresAt } });
    await recordAudit(tx, ctx, {
      action: "invitation.regenerated",
      entityType: "invitation",
      entityId: invitation.id,
      changes: { email: invitation.email, role: invitation.role },
    });
  });
  return { inviteUrl: inviteUrl(token), expiresAt };
}

export async function revokeInvitation(ctx: Ctx, invitationId: string): Promise<void> {
  assertCan(ctx, "members:manage");
  await db.$transaction(async (tx) => {
    const invitation = await findPendingInWorkspace(tx, ctx, invitationId);
    await tx.invitation.update({ where: { id: invitation.id }, data: { revokedAt: new Date() } });
    await recordAudit(tx, ctx, {
      action: "invitation.revoked",
      entityType: "invitation",
      entityId: invitation.id,
      changes: { email: invitation.email, role: invitation.role },
    });
  });
}

/** What the invitation page may show to whoever holds the link. */
export async function findInvitation(token: string) {
  const invitation = await findPending(db, token);
  if (!invitation) return null;
  return {
    email: invitation.email,
    role: invitation.role,
    workspaceName: invitation.workspace.name,
    expiresAt: invitation.expiresAt,
  };
}

/** Marks the invitation used; fails if another request used or revoked it first. */
async function claim(tx: DbClient, invitationId: string, userId: string, now: Date) {
  const claimed = await tx.invitation.updateMany({
    where: { id: invitationId, acceptedAt: null, revokedAt: null, expiresAt: { gt: now } },
    data: { acceptedAt: now, acceptedById: userId },
  });
  if (claimed.count !== 1) throw invalidInvitation();
}

async function join(
  tx: DbClient,
  invitation: { id: string; workspaceId: string; email: string; role: Role },
  userId: string,
) {
  const membership = await tx.membership.create({
    data: { workspaceId: invitation.workspaceId, userId, role: invitation.role },
  });
  await recordAudit(
    tx,
    { userId, workspaceId: invitation.workspaceId, role: invitation.role },
    {
      action: "member.joined",
      entityType: "member",
      entityId: membership.id,
      changes: { email: invitation.email, role: invitation.role, invitationId: invitation.id },
    },
  );
  return membership;
}

/**
 * Accepts an invitation for a signed-in user. Only the link grants access, and only to the
 * account with the invited address: membership, the used mark and the audit entry are written
 * in one transaction.
 */
export async function acceptInvitation(
  userId: string,
  token: string,
): Promise<{ workspaceId: string }> {
  return db.$transaction(async (tx) => {
    const now = new Date();
    const invitation = await findPending(tx, token, now);
    if (!invitation) throw invalidInvitation();
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.email !== invitation.email) {
      throw new ForbiddenError("This invitation was sent to a different email address.");
    }
    const existing = await tx.membership.findUnique({
      where: { workspaceId_userId: { workspaceId: invitation.workspaceId, userId } },
      select: { id: true },
    });
    if (existing) throw new ConflictError("You are already a member of this workspace.");
    await claim(tx, invitation.id, userId, now);
    await join(tx, invitation, userId);
    return { workspaceId: invitation.workspaceId };
  });
}

/** The invitee turns the invitation down; the link stops working. */
export async function declineInvitation(userId: string, token: string): Promise<void> {
  await db.$transaction(async (tx) => {
    const invitation = await findPending(tx, token);
    if (!invitation) throw invalidInvitation();
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.email !== invitation.email) {
      throw new ForbiddenError("This invitation was sent to a different email address.");
    }
    await tx.invitation.update({ where: { id: invitation.id }, data: { revokedAt: new Date() } });
    await recordAudit(
      tx,
      { userId, workspaceId: invitation.workspaceId, role: invitation.role },
      {
        action: "invitation.declined",
        entityType: "invitation",
        entityId: invitation.id,
        changes: { email: invitation.email, role: invitation.role },
      },
    );
  });
}

/**
 * Creates an account for the invited address and joins the workspace in one go. No workspace of
 * their own is created; the email always comes from the invitation, never from the form.
 */
export async function registerWithInvitation(rawInput: unknown) {
  const token = (rawInput as { token?: unknown } | null)?.token;
  // Check the link before the form, so every bad link gets the same answer.
  if (typeof token !== "string" || !(await findPending(db, token.trim()))) {
    throw invalidInvitation();
  }
  const input = parseInput(invitationRegisterSchema, rawInput);
  const passwordHash = await hashPassword(input.password);
  const timezone = input.timezone && isValidTimeZone(input.timezone) ? input.timezone : "UTC";

  const { userId, workspaceId } = await db.$transaction(async (tx) => {
    const now = new Date();
    const invitation = await findPending(tx, input.token, now);
    if (!invitation) throw invalidInvitation();
    const existing = await tx.user.findUnique({
      where: { email: invitation.email },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictError("An account with this email already exists. Sign in to accept.");
    }
    const user = await tx.user.create({
      data: { email: invitation.email, name: input.name, passwordHash, timezone },
    });
    await claim(tx, invitation.id, user.id, now);
    await join(tx, invitation, user.id);
    return { userId: user.id, workspaceId: invitation.workspaceId };
  });

  const session = await createSession(db, { userId, workspaceId });
  return { ...session, userId, workspaceId };
}
