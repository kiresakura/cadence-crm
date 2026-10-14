import "server-only";

import { NextResponse, type NextRequest } from "next/server";

import { AppError } from "../errors";
import { getRequestContext, type WorkspaceRequestContext } from "./request";

export function apiError(status: number, code: string, message: string, fieldErrors?: unknown) {
  return NextResponse.json({ error: { code, message, fieldErrors } }, { status });
}

function isCrossSiteWrite(request: NextRequest): boolean {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return false;
  const origin = request.headers.get("origin");
  if (!origin) return false;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  try {
    return new URL(origin).host !== host;
  } catch {
    return true;
  }
}

/**
 * Wraps a route handler: requires a signed-in workspace member, rejects cross-site writes,
 * and maps `AppError`s to JSON error responses with the right status code.
 */
export function withApi<P>(
  handler: (request: NextRequest, context: WorkspaceRequestContext, params: P) => Promise<Response>,
) {
  return async (request: NextRequest, route: { params: Promise<P> }): Promise<Response> => {
    try {
      if (isCrossSiteWrite(request)) {
        return apiError(403, "FORBIDDEN", "Cross-site requests are not allowed.");
      }
      const context = await getRequestContext();
      if (!context?.ctx || !context.workspace) {
        return apiError(401, "UNAUTHENTICATED", "Sign in to use the API.");
      }
      return await handler(request, context as WorkspaceRequestContext, await route.params);
    } catch (error) {
      if (error instanceof AppError) {
        return apiError(error.status, error.code, error.message, error.fieldErrors);
      }
      console.error(error);
      return apiError(500, "INTERNAL", "Something went wrong.");
    }
  };
}

export async function readJson(request: NextRequest): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new AppError("BAD_REQUEST", "Request body must be valid JSON.");
  }
}
