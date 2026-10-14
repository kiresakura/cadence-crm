import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { setSessionWorkspace, validateSessionToken, type SessionUser } from "../auth/session";
import { db } from "../db";
import { shouldUseSecureCookies } from "../env";
import type { Ctx } from "../permissions";

export const SESSION_COOKIE = "cadence_session";

export async function setSessionCookie(token: string, expiresAt: Date): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: shouldUseSecureCookies(),
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

export async function readSessionToken(): Promise<string | null> {
  const store = await cookies();
  return store.get(SESSION_COOKIE)?.value ?? null;
}

export interface WorkspaceSummary {
  id: string;
  name: string;
  slug: string;
  currency: string;
}

export interface RequestContext {
  sessionId: string;
  user: SessionUser;
  /** Null when the user does not belong to any workspace yet. */
  ctx: Ctx | null;
  workspace: WorkspaceSummary | null;
}

export type WorkspaceRequestContext = RequestContext & { ctx: Ctx; workspace: WorkspaceSummary };

/**
 * Resolves the signed-in user and their active workspace for this request (memoised per
 * request). Membership is looked up every time, so removed members lose access immediately.
 */
export const getRequestContext = cache(async (): Promise<RequestContext | null> => {
  const token = await readSessionToken();
  if (!token) return null;
  const session = await validateSessionToken(db, token);
  if (!session) return null;

  const include = { workspace: { select: { id: true, name: true, slug: true, currency: true } } };
  let membership = session.workspaceId
    ? await db.membership.findUnique({
        where: {
          workspaceId_userId: { workspaceId: session.workspaceId, userId: session.user.id },
        },
        include,
      })
    : null;
  if (!membership) {
    membership = await db.membership.findFirst({
      where: { userId: session.user.id },
      orderBy: { createdAt: "asc" },
      include,
    });
    if (membership) await setSessionWorkspace(db, session.id, membership.workspaceId);
  }

  return {
    sessionId: session.id,
    user: session.user,
    ctx: membership
      ? { userId: session.user.id, workspaceId: membership.workspaceId, role: membership.role }
      : null,
    workspace: membership?.workspace ?? null,
  };
});

/** For pages: redirects to sign-in (or onboarding) instead of rendering without a context. */
export async function requirePageContext(): Promise<WorkspaceRequestContext> {
  const request = await getRequestContext();
  if (!request) redirect("/login");
  if (!request.ctx || !request.workspace) redirect("/onboarding");
  return request as WorkspaceRequestContext;
}
