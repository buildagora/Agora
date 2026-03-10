/**
 * POST /api/auth/sign-up
 * Compatibility alias for /api/auth/signup (canonical endpoint)
 * 
 * Forwards to the canonical signup handler to ensure both endpoints behave identically.
 */

import { NextRequest } from "next/server";
import { signUpHandler } from "@/lib/auth/handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  // Forward to canonical signup handler
  return signUpHandler(request);
}
