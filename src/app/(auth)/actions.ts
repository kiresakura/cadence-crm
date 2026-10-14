"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import type { ActionResult } from "@/lib/action-result";
import { changePassword, login, registerUser, updateProfile } from "@/server/auth/service";
import { deleteSessionByToken, setSessionWorkspace } from "@/server/auth/session";
import { db } from "@/server/db";
import { toActionError } from "@/server/next/action";
import {
  clearSessionCookie,
  getClientIp,
  getRequestContext,
  readSessionToken,
  setSessionCookie,
} from "@/server/next/request";
import { safeNext } from "@/server/safe-redirect";
import {
  acceptInvitation,
  declineInvitation,
  registerWithInvitation,
} from "@/server/services/invitations";
import { formToObject } from "@/server/validation/common";
import { createWorkspace, switchWorkspace } from "@/server/services/workspaces";

export async function loginAction(formData: FormData): Promise<ActionResult> {
  try {
    // A session the browser already holds is revoked, not left valid next to the new one.
    const session = await login(formToObject(formData), {
      ip: await getClientIp(),
      previousToken: await readSessionToken(),
    });
    await setSessionCookie(session.token, session.expiresAt);
  } catch (error) {
    return toActionError(error);
  }
  redirect(safeNext(formData.get("next")));
}

export async function registerAction(formData: FormData): Promise<ActionResult> {
  try {
    const session = await registerUser(formToObject(formData), {
      ip: await getClientIp(),
      previousToken: await readSessionToken(),
    });
    await setSessionCookie(session.token, session.expiresAt);
  } catch (error) {
    return toActionError(error);
  }
  redirect("/dashboard");
}

export async function logoutAction(): Promise<void> {
  const token = await readSessionToken();
  if (token) await deleteSessionByToken(db, token);
  await clearSessionCookie();
  redirect("/login");
}

export async function switchWorkspaceAction(workspaceId: string): Promise<ActionResult> {
  try {
    const request = await getRequestContext();
    if (!request) return { ok: false, error: "Please sign in again." };
    await switchWorkspace(request.sessionId, request.user.id, workspaceId);
  } catch (error) {
    return toActionError(error);
  }
  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export async function createWorkspaceAction(formData: FormData): Promise<ActionResult> {
  try {
    const request = await getRequestContext();
    if (!request) return { ok: false, error: "Please sign in again." };
    const workspace = await createWorkspace(request.user.id, formToObject(formData));
    await setSessionWorkspace(db, request.sessionId, workspace.id);
  } catch (error) {
    return toActionError(error);
  }
  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export async function updateProfileAction(formData: FormData): Promise<ActionResult> {
  try {
    const request = await getRequestContext();
    if (!request) return { ok: false, error: "Please sign in again." };
    await updateProfile(request.user.id, formToObject(formData));
  } catch (error) {
    return toActionError(error);
  }
  revalidatePath("/", "layout");
  return { ok: true, data: null };
}

export async function changePasswordAction(formData: FormData): Promise<ActionResult> {
  try {
    const request = await getRequestContext();
    if (!request) return { ok: false, error: "Please sign in again." };
    await changePassword(request.user.id, request.sessionId, formToObject(formData));
  } catch (error) {
    return toActionError(error);
  }
  return { ok: true, data: null };
}

export async function registerWithInvitationAction(formData: FormData): Promise<ActionResult> {
  try {
    const previous = await readSessionToken();
    if (previous) await deleteSessionByToken(db, previous);
    const session = await registerWithInvitation(formToObject(formData));
    await setSessionCookie(session.token, session.expiresAt);
  } catch (error) {
    return toActionError(error);
  }
  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export async function acceptInvitationAction(token: string): Promise<ActionResult> {
  try {
    const request = await getRequestContext();
    if (!request) return { ok: false, error: "Please sign in again." };
    const { workspaceId } = await acceptInvitation(request.user.id, token);
    await setSessionWorkspace(db, request.sessionId, workspaceId);
  } catch (error) {
    return toActionError(error);
  }
  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export async function declineInvitationAction(token: string): Promise<ActionResult> {
  try {
    const request = await getRequestContext();
    if (!request) return { ok: false, error: "Please sign in again." };
    await declineInvitation(request.user.id, token);
  } catch (error) {
    return toActionError(error);
  }
  revalidatePath("/", "layout");
  redirect("/dashboard");
}

/** Signs out so the invited person can sign in with the right account and come back. */
export async function switchAccountForInvitationAction(token: string): Promise<void> {
  const sessionToken = await readSessionToken();
  if (sessionToken) await deleteSessionByToken(db, sessionToken);
  await clearSessionCookie();
  redirect(`/login?next=${safeNext(`/invite/${token}`)}`);
}
