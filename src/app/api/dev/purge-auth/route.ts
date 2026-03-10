import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  // Dev-only endpoint placeholder. (No side effects unless you add them intentionally later.)
  return NextResponse.json({ ok: true });
}


