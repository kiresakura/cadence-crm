import { NextResponse } from "next/server";

import { readJson, withApi } from "@/server/next/api";
import {
  contactToInput,
  deleteContact,
  getContact,
  updateContact,
} from "@/server/services/contacts";

type Params = { id: string };

export const GET = withApi<Params>(async (_request, { ctx }, { id }) => {
  return NextResponse.json(await getContact(ctx, id));
});

/** PATCH merges the given fields into the current contact, then validates the result. */
export const PATCH = withApi<Params>(async (request, { ctx }, { id }) => {
  const body = await readJson(request);
  const current = contactToInput(await getContact(ctx, id));
  const patch = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  return NextResponse.json(await updateContact(ctx, id, { ...current, ...patch }));
});

export const DELETE = withApi<Params>(async (_request, { ctx }, { id }) => {
  await deleteContact(ctx, id);
  return new NextResponse(null, { status: 204 });
});
