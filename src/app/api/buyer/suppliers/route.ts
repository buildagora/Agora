/**
 * Buyer Suppliers API
 * Returns reference suppliers (read-only) for the authenticated buyer
 */

import { NextRequest, NextResponse } from "next/server";
import { requireServerEnv } from "@/lib/env";
import { jsonOk, jsonError, withErrorHandling } from "@/lib/apiResponse";
import { requireCurrentUserFromRequest } from "@/lib/auth/server";
import { getPrisma } from "@/lib/db.server";
import { normalizeToCanonicalCategoryId } from "@/lib/suppliers/categoryTaxonomy";

// CRITICAL: Explicitly set nodejs runtime - Prisma cannot run in Edge runtime
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return withErrorHandling(async () => {
    requireServerEnv();

    let user;
    try {
      user = await requireCurrentUserFromRequest(request);
    } catch {
      return jsonError("UNAUTHORIZED", "Authentication required", 401);
    }

    if (user.role !== "BUYER") {
      return jsonError("FORBIDDEN", "Buyer access required", 403);
    }

    const { searchParams } = new URL(request.url);
    const rawCategory =
      searchParams.get("categoryId") || searchParams.get("category") || "roofing";
    const categoryId = normalizeToCanonicalCategoryId(rawCategory);
    const city = searchParams.get("city") || "Huntsville";
    const state = (searchParams.get("state") || "AL").toUpperCase();

    if (!categoryId) {
      return jsonError("BAD_REQUEST", "Invalid category", 400);
    }

    const prisma = getPrisma();
    const suppliers = await prisma.supplier.findMany({
      where: {
        city,
        state,
        categoryLinks: {
          some: { categoryId },
        },
      },
      orderBy: { name: "asc" },
    });

    return jsonOk({ suppliers });
  });
}
