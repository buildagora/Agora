/**
 * Buyer Preferred Suppliers API
 * Returns all preferred supplier rules for the authenticated buyer
 */

import { NextRequest } from "next/server";
import { requireServerEnv } from "@/lib/env";
import { jsonOk, jsonError, withErrorHandling } from "@/lib/apiResponse";
import { requireCurrentUserFromRequest } from "@/lib/auth/server";
import { getPrisma } from "@/lib/db.server";
import { normalizeCategory } from "@/lib/categories/normalizeCategory";
import { labelToCategoryId } from "@/lib/categoryIds";

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

    // Query preferred supplier rules from database
    const prisma = getPrisma();
    const dbRules = await prisma.preferredSupplierRule.findMany({
      where: { buyerId: user.id },
      orderBy: { createdAt: "desc" },
    });

    // Parse JSON fields and return
    const rules = dbRules.map(rule => {
      // Use categoryId if available, otherwise fall back to category (legacy)
      const categoryId = rule.categoryId || normalizeCategory(rule.category) || rule.category;
      
      // Parse sellerIds safely (treat invalid JSON as empty array)
      let sellerIds: string[] = [];
      try {
        sellerIds = rule.sellerIds ? JSON.parse(rule.sellerIds) : [];
        if (!Array.isArray(sellerIds)) {
          sellerIds = [];
        }
      } catch {
        sellerIds = [];
      }
      
      return {
        ruleId: rule.id,
        id: rule.id,
        buyerId: rule.buyerId,
        category: rule.category, // Keep for backward compatibility
        categoryId: categoryId || rule.category, // Canonical categoryId (fallback to category if normalization fails)
        sellerIds,
        enabled: rule.enabled,
        createdAt: rule.createdAt.toISOString(),
        updatedAt: rule.updatedAt.toISOString(),
      };
    });

    // Collect all sellerIds across all rules
    const allSellerIds = new Set<string>();
    for (const rule of rules) {
      for (const sellerId of rule.sellerIds) {
        if (sellerId && typeof sellerId === "string") {
          allSellerIds.add(sellerId);
        }
      }
    }

    // Query seller metadata for all sellerIds
    const sellerIdsArray = Array.from(allSellerIds);
    const dbSellers = sellerIdsArray.length > 0
      ? await prisma.user.findMany({
          where: {
            id: { in: sellerIdsArray },
            role: "SELLER",
          },
          select: {
            id: true,
            companyName: true,
            fullName: true,
            email: true,
          },
        })
      : [];

    // Build sellersById map
    const sellersById: Record<string, { id: string; companyName: string | null; fullName: string | null; email: string | null }> = {};
    for (const seller of dbSellers) {
      sellersById[seller.id] = {
        id: seller.id,
        companyName: seller.companyName,
        fullName: seller.fullName,
        email: seller.email,
      };
    }

    // Return new shape with rules and sellersById
    return jsonOk({ rules, sellersById }, 200);
  });
}

export async function POST(request: NextRequest) {
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

    const body = await request.json().catch(() => ({}));
    const { category, categoryId, sellerIds, enabled } = body;

    // Normalize category to categoryId
    let normalizedCategoryId: string | null = null;
    if (categoryId && typeof categoryId === "string") {
      normalizedCategoryId = normalizeCategory(categoryId) || categoryId;
    } else if (category && typeof category === "string") {
      // Try to convert category label to categoryId
      normalizedCategoryId = normalizeCategory(category) || labelToCategoryId[category as keyof typeof labelToCategoryId] || category;
    }

    if (!normalizedCategoryId) {
      return jsonError("BAD_REQUEST", "category or categoryId (string) required", 400);
    }

    if (!sellerIds || !Array.isArray(sellerIds)) {
      return jsonError("BAD_REQUEST", "sellerIds (array) required", 400);
    }

    // GUARDRAIL: Validate sellerIds are valid SELLER users
    const prisma = getPrisma();
    if (sellerIds.length > 0) {
      const found = await prisma.user.findMany({
        where: {
          id: { in: sellerIds },
          role: "SELLER",
        },
        select: { id: true },
      });
      
      if (found.length !== sellerIds.length) {
        return jsonError("BAD_REQUEST", "sellerIds must be valid seller user ids", 400);
      }
    }

    // DEV-ONLY: Log save operation
    if (process.env.NODE_ENV === "development") {
      console.log("[PREFERRED_SUPPLIERS_SAVE]", {
        buyerId: user.id,
        category: category || normalizedCategoryId,
        categoryId: normalizedCategoryId,
        sellerIdsCount: sellerIds.length,
        enabled: enabled !== undefined ? enabled : true,
      });
    }

    // Save preferred supplier rule to database
    
    // Check if rule already exists for this categoryId (or legacy category)
    const existing = await prisma.preferredSupplierRule.findFirst({
      where: {
        buyerId: user.id,
        OR: [
          { categoryId: normalizedCategoryId },
          { category: normalizedCategoryId },
          ...(category ? [{ category }] : []),
        ],
      },
    });

    if (existing) {
      // Update existing rule
      const updated = await prisma.preferredSupplierRule.update({
        where: { id: existing.id },
        data: {
          categoryId: normalizedCategoryId, // Update to use categoryId
          category: category || normalizedCategoryId, // Keep category for backward compatibility
          sellerIds: JSON.stringify(sellerIds),
          enabled: enabled !== undefined ? enabled : true,
        },
      });

      return jsonOk({
        id: updated.id,
        ruleId: updated.id,
        category: updated.category,
        categoryId: updated.categoryId || normalizedCategoryId,
        sellerIds: JSON.parse(updated.sellerIds),
        enabled: updated.enabled,
      }, 200);
    } else {
      // Create new rule
      const created = await prisma.preferredSupplierRule.create({
        data: {
          buyerId: user.id,
          categoryId: normalizedCategoryId,
          category: category || normalizedCategoryId, // Keep category for backward compatibility
          sellerIds: JSON.stringify(sellerIds),
          enabled: enabled !== undefined ? enabled : true,
        },
      });

      return jsonOk({
        id: created.id,
        ruleId: created.id,
        category: created.category,
        categoryId: created.categoryId || normalizedCategoryId,
        sellerIds: JSON.parse(created.sellerIds),
        enabled: created.enabled,
      }, 200);
    }
  });
}

export async function DELETE(request: NextRequest) {
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

    const body = await request.json().catch(() => ({}));
    const { category, categoryId } = body;

    // Normalize category to categoryId
    let normalizedCategoryId: string | null = null;
    if (categoryId && typeof categoryId === "string") {
      normalizedCategoryId = normalizeCategory(categoryId) || categoryId;
    } else if (category && typeof category === "string") {
      normalizedCategoryId = normalizeCategory(category) || labelToCategoryId[category as keyof typeof labelToCategoryId] || category;
    }

    if (!normalizedCategoryId) {
      return jsonError("BAD_REQUEST", "category or categoryId (string) required", 400);
    }

    // Delete preferred supplier rule from database
    const prisma = getPrisma();
    
    await prisma.preferredSupplierRule.deleteMany({
      where: {
        buyerId: user.id,
        OR: [
          { categoryId: normalizedCategoryId },
          { category: normalizedCategoryId },
          ...(category ? [{ category }] : []),
        ],
      },
    });

    return jsonOk({ success: true }, 200);
  });
}
