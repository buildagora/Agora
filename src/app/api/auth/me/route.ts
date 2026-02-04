/**
 * GET /api/auth/me
 * Canonical auth check endpoint
 * 
 * Returns authenticated user or ok:false
 * MUST use force-dynamic, revalidate=0, and Cache-Control: no-store
 */

import { NextRequest } from "next/server";
import { meHandler } from "@/lib/auth/handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest) {
  return meHandler(request);
}
