/**
 * Public read-only supplier discovery by category (no auth).
 * Returns only id, name, categories — safe for anonymous landing-page search.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireServerEnv } from "@/lib/env";
import { jsonError, withErrorHandling } from "@/lib/apiResponse";
import { BUYER_LIVE_CATEGORY_IDS } from "@/lib/categoryDisplay";
import { querySuppliersForDiscovery } from "@/lib/suppliers/supplierDiscovery.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_CATEGORIES = new Set<string>(BUYER_LIVE_CATEGORY_IDS);

export async function GET(request: NextRequest) {
  return withErrorHandling(async () => {
    requireServerEnv();

    const categoryId = request.nextUrl.searchParams.get("categoryId");
    if (!categoryId || categoryId.trim() === "") {
      return jsonError("BAD_REQUEST", "categoryId is required", 400);
    }

    const normalized = categoryId.trim().toLowerCase();
    if (normalized === "all") {
      return jsonError("BAD_REQUEST", "categoryId must be a specific category", 400);
    }

    if (!ALLOWED_CATEGORIES.has(normalized)) {
      return jsonError("BAD_REQUEST", "Unknown or unsupported category", 400);
    }

    const suppliers = await querySuppliersForDiscovery(normalized);

    return NextResponse.json({ ok: true, suppliers });
  });
}
