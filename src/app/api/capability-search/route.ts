import { NextResponse } from "next/server";
import { searchCapabilities } from "@/lib/search/capabilitySearch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/capability-search?q=...
 * Public read: supplier capability search for results UI (no auth).
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") ?? "";
  const results = await searchCapabilities(q);
  return NextResponse.json(results);
}
