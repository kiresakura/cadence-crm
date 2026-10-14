import "server-only";

import { unstable_rethrow } from "next/navigation";

import { AppError, type FieldErrors } from "../errors";
import { getRequestContext, type WorkspaceRequestContext } from "./request";

export type ActionResult<T = null> =
  { ok: true; data: T; message?: string } | { ok: false; error: string; fieldErrors?: FieldErrors };

export const initialActionState: ActionResult<null> = { ok: true, data: null };

export function toActionError(error: unknown): ActionResult<never> {
  unstable_rethrow(error);
  if (error instanceof AppError) {
    return { ok: false, error: error.message, fieldErrors: error.fieldErrors };
  }
  console.error(error);
  return { ok: false, error: "Something went wrong. Please try again." };
}

/**
 * Runs a server action body with the caller's workspace context, turning expected errors
 * into a serialisable result the form can display.
 */
export async function runAction<T>(
  body: (request: WorkspaceRequestContext) => Promise<T>,
): Promise<ActionResult<T>> {
  try {
    const request = await getRequestContext();
    if (!request?.ctx || !request.workspace) {
      return { ok: false, error: "Your session has expired. Please sign in again." };
    }
    const data = await body(request as WorkspaceRequestContext);
    return { ok: true, data };
  } catch (error) {
    return toActionError(error);
  }
}
