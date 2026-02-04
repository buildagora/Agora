/**
 * GET /api/health
 * Simple health check endpoint (no database dependency)
 */

import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "agora",
    ts: Date.now(),
  }, {
    headers: {
      "Content-Type": "application/json",
    },
  });
}


