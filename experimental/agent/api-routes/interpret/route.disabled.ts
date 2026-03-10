/**
 * POST /api/agent/interpret
 * 
 * DEPRECATED: This endpoint is no longer used.
 * Use /api/agent/turn instead.
 */

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(_req: Request) {
  return NextResponse.json(
    { ok: false, error: "DEPRECATED_USE_AGENT_TURN" },
    { status: 410 }
  );
}
