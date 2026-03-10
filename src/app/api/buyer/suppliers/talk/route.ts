import { NextRequest, NextResponse } from "next/server";
import { requireCurrentUserFromRequest } from "@/lib/auth/server";
import { getPrisma } from "@/lib/db.server";
import { jsonError, withErrorHandling } from "@/lib/apiResponse";

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

    if (!categoryId || categoryId.trim() === "" || categoryId.toLowerCase() === "all") {
      // Return all suppliers when no category filter is specified
      const prisma = getPrisma();
      const suppliers = await prisma.supplier.findMany({
        select: {
          id: true,
          name: true,
          categoryLinks: {
            select: { categoryId: true },
          },
        },
        orderBy: { name: "asc" },
      });

      const formattedSuppliers = suppliers.map((s) => ({
        id: s.id,
        name: s.name,
        categories: s.categoryLinks.map((link) => link.categoryId),
      }));

      return NextResponse.json({ ok: true, suppliers: formattedSuppliers });
    }

    const prisma = getPrisma();

    // Use SupplierCategoryLink as the canonical source of truth for category filtering
    // CRITICAL: Do NOT use Supplier.category - it is deprecated
    const normalizedCategoryId = categoryId.trim().toLowerCase();

    const suppliers = await prisma.supplier.findMany({
      where: {
        categoryLinks: {
          some: {
            categoryId: normalizedCategoryId,
          },
        },
      },
      select: {
        id: true,
        name: true,
        categoryLinks: {
          select: { categoryId: true },
        },
      },
      orderBy: { name: "asc" },
    });

    // Format response: derive categories from categoryLinks
    const formattedSuppliers = suppliers.map((s) => ({
      id: s.id,
      name: s.name,
      categories: s.categoryLinks.map((link) => link.categoryId),
    }));

    return NextResponse.json({ ok: true, suppliers: formattedSuppliers });
  });
}

