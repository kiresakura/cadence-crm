"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import type { ActionResult } from "@/lib/action-result";
import { login, registerUser } from "@/server/auth/service";
import { deleteSessionByToken, setSessionWorkspace } from "@/server/auth/session";
import { db } from "@/server/db";
import { toActionError } from "@/server/next/action";
import {
  clearSessionCookie,
  getRequestContext,
  readSessionToken,
  setSessionCookie,
} from "@/server/next/request";
import { formToObject } from "@/server/validation/common";
import { createWorkspace, switchWorkspace } from "@/server/services/workspaces";

/** Only same-site relative paths are allowed as post-login destinations. */
function safeNext(value: FormDataEntryValue | null): string {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//")
    ? value
    : "/dashboard";
}

export async function loginAction(formData: FormData): Promise<ActionResult> {
  try {
    const session = await login(formToObject(formData));
    await setSessionCookie(session.token, session.expiresAt);
  } catch (error) {
    return toActionError(error);
  }
  redirect(safeNext(formData.get("next")));
}

export async function registerAction(formData: FormData): Promise<ActionResult> {
  try {
    const session = await registerUser(formToObject(formData));
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
