import { withApi } from "@/server/next/api";
import { parseContactFilters } from "@/server/services/contacts";
import { exportContactsCsv } from "@/server/services/exports";

/** CSV download of contacts matching the current list filters. */
export const GET = withApi(async (request, { ctx }) => {
  const csv = await exportContactsCsv(ctx, parseContactFilters(request.nextUrl.searchParams));
  const date = new Date().toISOString().slice(0, 10);
  // The byte order mark makes spreadsheet apps read the file as UTF-8.
  return new Response(`﻿${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="contacts-${date}.csv"`,
      "Cache-Control": "no-store",
    },
  });
});
