import { NextResponse } from "next/server";

import { readJson, withApi } from "@/server/next/api";
import { createContact, listContacts, parseContactFilters } from "@/server/services/contacts";

/** GET /api/contacts — list with the same filters as the contacts page. */
export const GET = withApi(async (request, { ctx }) => {
  const page = await listContacts(ctx, parseContactFilters(request.nextUrl.searchParams));
  return NextResponse.json(page);
});

/** POST /api/contacts — create a contact. Requires MEMBER or above. */
export const POST = withApi(async (request, { ctx }) => {
  const contact = await createContact(ctx, await readJson(request));
  return NextResponse.json(contact, { status: 201 });
});
