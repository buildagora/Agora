/**
 * POST /api/auth/login
 * Canonical login endpoint
 * 
 * Verifies email + password, sets HttpOnly cookie, returns user data
 */

import { NextRequest } from "next/server";
import { loginHandler } from "@/lib/auth/handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  return loginHandler(request);
}
