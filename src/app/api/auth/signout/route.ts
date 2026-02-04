/**
 * POST /api/auth/signout
 * DEPRECATED: Alias for POST /api/auth/logout
 *
 * This route forwards to the canonical logout handler.
 * Use POST /api/auth/logout instead.
 */

import { NextRequest } from "next/server";
import { logoutHandler } from "@/lib/auth/handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  return logoutHandler(request);
}

// Also support GET for convenience
export async function GET(request: NextRequest) {
  return logoutHandler(request);
}
