/**
 * DEPRECATED: This route is deprecated. Use POST /api/auth/sign-up instead.
 * 
 * This route returns 410 Gone to prevent legacy clients from using it.
 * All new code must use the canonical endpoint: POST /api/auth/sign-up
 */

import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  return NextResponse.json(
    {
      ok: false,
      error: "deprecated",
      message: "DEPRECATED: This endpoint is no longer available. Use POST /api/auth/sign-up instead.",
    },
    { status: 410 }
  );
}
