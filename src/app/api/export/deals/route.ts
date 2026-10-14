import { withApi } from "@/server/next/api";
import { parseDealFilters } from "@/server/services/deals";
import { exportDealsCsv } from "@/server/services/exports";

/** CSV download of deals matching the current list filters. */
export const GET = withApi(async (request, { ctx }) => {
  const csv = await exportDealsCsv(ctx, parseDealFilters(request.nextUrl.searchParams));
  const date = new Date().toISOString().slice(0, 10);
  return new Response(`﻿${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="deals-${date}.csv"`,
      "Cache-Control": "no-store",
    },
  });
});
