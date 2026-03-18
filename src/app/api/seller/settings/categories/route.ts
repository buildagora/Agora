/**
 * Seller Settings Categories API
 * GET: Returns current categories for the supplier organization
 * POST: Updates categories for the supplier organization (org-scoped)
 */

import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/db.server";
import { jsonOk, jsonError, withErrorHandling } from "@/lib/apiResponse";
import { requireCurrentUserFromRequest } from "@/lib/auth/server";
import { getSupplierMembershipForUser } from "@/lib/supplier/membership.server";
import { z } from "zod";
import { categoryIdToLabel, labelToCategoryId, type CategoryId } from "@/lib/categoryIds";
import { CATEGORY_IDS } from "@/lib/categoryDisplay";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UpdateCategoriesSchema = z.object({
  categoryIds: z.array(z.string()).min(0),
});

/**
 * GET /api/seller/settings/categories
 * Get current categories for the supplier organization
 */
export async function GET(request: NextRequest) {
  return withErrorHandling(async () => {
    // Auth check
    let user;
    try {
      user = await requireCurrentUserFromRequest(request);
    } catch {
      return jsonError("UNAUTHORIZED", "Authentication required", 401);
    }

    if (user.role !== "SELLER") {
      return jsonError("FORBIDDEN", "Seller access required", 403);
    }

    // Get supplier membership (org-scoped)
    const membership = await getSupplierMembershipForUser(user.id);
    if (!membership) {
      return jsonError(
        "FORBIDDEN",
        "Your seller account is not attached to an active supplier organization. Please contact support.",
        403
      );
    }

    const prisma = getPrisma();

    // Get categories from SupplierCategoryLink (canonical source)
    const categoryLinks = await prisma.supplierCategoryLink.findMany({
      where: { supplierId: membership.supplierId },
      select: { categoryId: true },
      orderBy: { categoryId: "asc" },
    });

    let categoryIds: string[] = categoryLinks.map((link) => link.categoryId);

    // Legacy fallback: if no category links exist, try parsing User.categoriesServed
    // This is only for initial display - SupplierCategoryLink becomes source of truth after save
    if (categoryIds.length === 0) {
      const dbUser = await prisma.user.findUnique({
        where: { id: user.id },
        select: { categoriesServed: true },
      });

      try {
        if (dbUser?.categoriesServed) {
          const parsed = JSON.parse(dbUser.categoriesServed);
          if (Array.isArray(parsed) && parsed.length > 0) {
            categoryIds = parsed;
          }
        }
      } catch {
        // Invalid JSON, treat as empty
      }
    }

    // Build response with both IDs and labels
    const categories = categoryIds.map((categoryId) => ({
      id: categoryId,
      label: categoryIdToLabel[categoryId as CategoryId] || categoryId,
    }));

    return jsonOk({
      categoryIds,
      categories,
    });
  });
}

/**
 * POST /api/seller/settings/categories
 * Update categories for the supplier organization (org-scoped)
 */
export async function POST(request: NextRequest) {
  return withErrorHandling(async () => {
    // Auth check
    let user;
    try {
      user = await requireCurrentUserFromRequest(request);
    } catch {
      return jsonError("UNAUTHORIZED", "Authentication required", 401);
    }

    if (user.role !== "SELLER") {
      return jsonError("FORBIDDEN", "Seller access required", 403);
    }

    // Get supplier membership (org-scoped)
    const membership = await getSupplierMembershipForUser(user.id);
    if (!membership) {
      return jsonError(
        "FORBIDDEN",
        "Your seller account is not attached to an active supplier organization. Please contact support.",
        403
      );
    }

    // Parse and validate body
    let body;
    try {
      body = await request.json();
    } catch {
      return jsonError("BAD_REQUEST", "Invalid JSON", 400);
    }

    const validation = UpdateCategoriesSchema.safeParse(body);
    if (!validation.success) {
      return jsonError("BAD_REQUEST", "Invalid categories data", 400, validation.error.issues);
    }

    // Normalize category IDs: ensure they're valid categoryIds
    const incomingCategoryIds = validation.data.categoryIds;
    const normalizedCategoryIds: string[] = [];

    for (const cat of incomingCategoryIds) {
      // If already a valid categoryId, use it
      if (CATEGORY_IDS.includes(cat as CategoryId)) {
        normalizedCategoryIds.push(cat);
      } else {
        // Try to convert label to categoryId
        const categoryId = labelToCategoryId[cat as keyof typeof labelToCategoryId];
        if (categoryId && CATEGORY_IDS.includes(categoryId)) {
          normalizedCategoryIds.push(categoryId);
        } else {
          // Invalid category - log and skip
          console.warn("[SELLER_CATEGORIES_SAVE_INVALID]", {
            supplierId: membership.supplierId,
            invalidCategory: cat,
          });
        }
      }
    }

    // Remove duplicates
    const uniqueCategoryIds = [...new Set(normalizedCategoryIds)];

    const prisma = getPrisma();

    // Replace existing category links for this supplier org
    // Delete all existing links
    await prisma.supplierCategoryLink.deleteMany({
      where: { supplierId: membership.supplierId },
    });

    // Create new category links
    if (uniqueCategoryIds.length > 0) {
      await prisma.supplierCategoryLink.createMany({
        data: uniqueCategoryIds.map((categoryId) => ({
          supplierId: membership.supplierId,
          categoryId,
        })),
        skipDuplicates: true, // Safety: skip if unique constraint violation
      });
    }

    // Optional: Also update User.categoriesServed for backwards compatibility (legacy mirror)
    // This is NOT used for feed, but helps with migration/backwards compatibility
    await prisma.user.update({
      where: { id: user.id },
      data: {
        categoriesServed: JSON.stringify(uniqueCategoryIds),
      },
    });

    // Build response with both IDs and labels
    const categories = uniqueCategoryIds.map((categoryId) => ({
      id: categoryId,
      label: categoryIdToLabel[categoryId as CategoryId] || categoryId,
    }));

    return jsonOk({
      categoryIds: uniqueCategoryIds,
      categories,
    });
  });
}



