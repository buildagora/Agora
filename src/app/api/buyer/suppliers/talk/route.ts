import { NextRequest, NextResponse } from "next/server";
import { requireCurrentUserFromRequest } from "@/lib/auth/server";
import { jsonError, withErrorHandling } from "@/lib/apiResponse";
import { querySuppliersForDiscovery } from "@/lib/suppliers/supplierDiscovery.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/buyer/suppliers/talk
 * 
 * Returns suppliers filtered by category for the "Talk to Suppliers" feature.
 * 
 * CRITICAL: This API uses SupplierCategoryLink as the ONLY source of truth for category filtering.
 * Supplier.category is deprecated and should NOT be used for filtering.
 * 
 * Category filtering works with canonical lowercase category IDs:
 * - roofing, hvac, electrical, plumbing, framing, drywall, concrete, lumber_siding
 * 
 * @param categoryId - Optional canonical category ID (lowercase). If "all" or empty, returns all suppliers.
 */
export async function GET(request: NextRequest) {
  return withErrorHandling(async () => {
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
    const categoryId = searchParams.get("categoryId");

    const normalizedCategoryId =
      !categoryId || categoryId.trim() === "" || categoryId.toLowerCase() === "all"
        ? null
        : categoryId.trim().toLowerCase();

    const formattedSuppliers = await querySuppliersForDiscovery(normalizedCategoryId);

    return NextResponse.json({ ok: true, suppliers: formattedSuppliers });
  });
}

