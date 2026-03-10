/**
 * POST /api/auth/signup
 * Canonical sign-up endpoint (no hyphen)
 * 
 * Creates new user account in database with hashed password.
 * Does NOT auto-login (user must sign in after sign-up).
 */

import { NextRequest } from "next/server";
import { signUpHandler } from "@/lib/auth/handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  return signUpHandler(request);
}
