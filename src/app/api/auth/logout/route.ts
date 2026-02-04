/**
 * POST /api/auth/logout
 * Canonical logout endpoint
 * 
 * Clears cookie "agora.auth" and returns ok:true
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
