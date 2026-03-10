import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  // Dev-only endpoint placeholder.
  // If real behavior existed before, it can be restored later—right now we just need module shape.
  return NextResponse.json({ ok: true, users: [] });
}


