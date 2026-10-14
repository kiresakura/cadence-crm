import { NextResponse } from "next/server";

import { db } from "@/server/db";

export const dynamic = "force-dynamic";

/** Liveness and database connectivity check for container orchestration. */
export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok", database: "ok" });
  } catch {
    return NextResponse.json({ status: "error", database: "unreachable" }, { status: 503 });
  }
}
