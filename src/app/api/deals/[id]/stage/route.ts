import { NextResponse } from "next/server";

import { readJson, withApi } from "@/server/next/api";
import { moveDeal } from "@/server/services/deals";

/** POST /api/deals/:id/stage — `{ stageId, lostReason? }`, same rules as the kanban board. */
export const POST = withApi<{ id: string }>(async (request, { ctx }, { id }) => {
  const deal = await moveDeal(ctx, id, await readJson(request));
  return NextResponse.json(deal);
});
