/** Result shape returned by every server action (mirrors src/server/next/action.ts). */
export type ActionResult<T = null> =
  | { ok: true; data: T; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };
