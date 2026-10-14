import { createHmac, randomBytes } from "node:crypto";

import type { DbClient } from "../db";
import { getAuthSecret } from "../env";

export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  timezone: string;
}

export interface ValidSession {
  id: string;
  workspaceId: string | null;
  expiresAt: Date;
  user: SessionUser;
}

/** 256-bit random token. Only the client keeps it; the database stores an HMAC of it. */
export function generateSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashSessionToken(token: string, secret: string = getAuthSecret()): string {
  return createHmac("sha256", secret).update(token).digest("hex");
}

export async function createSession(
  db: DbClient,
  input: { userId: string; workspaceId: string | null; now?: Date },
): Promise<{ token: string; expiresAt: Date }> {
  const token = generateSessionToken();
  const expiresAt = new Date((input.now ?? new Date()).getTime() + SESSION_TTL_MS);
  await db.session.create({
    data: {
      id: hashSessionToken(token),
      userId: input.userId,
      workspaceId: input.workspaceId,
      expiresAt,
    },
  });
  return { token, expiresAt };
}

export async function validateSessionToken(
  db: DbClient,
  token: string,
  now: Date = new Date(),
): Promise<ValidSession | null> {
  if (!token || token.length > 200) return null;
  const session = await db.session.findUnique({
    where: { id: hashSessionToken(token) },
    select: {
      id: true,
      workspaceId: true,
      expiresAt: true,
      user: { select: { id: true, email: true, name: true, timezone: true } },
    },
  });
  if (!session) return null;
  if (session.expiresAt.getTime() <= now.getTime()) {
    await db.session.deleteMany({ where: { id: session.id } });
    return null;
  }
  return session;
}

export async function deleteSessionByToken(db: DbClient, token: string): Promise<void> {
  await db.session.deleteMany({ where: { id: hashSessionToken(token) } });
}

export async function setSessionWorkspace(
  db: DbClient,
  sessionId: string,
  workspaceId: string | null,
): Promise<void> {
  await db.session.update({ where: { id: sessionId }, data: { workspaceId } });
}
