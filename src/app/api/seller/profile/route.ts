/**
 * Seller Profile API
 * Updates seller profile information (categories, service area, etc.)
 */

import { NextRequest } from "next/server";
import { requireServerEnv } from "@/lib/env";
import { jsonOk, jsonError, withErrorHandling } from "@/lib/apiResponse";
import { requireCurrentUserFromRequest } from "@/lib/auth/server";
import { getPrisma } from "@/lib/db.server";
import { z } from "zod";
import { labelToCategoryId, CATEGORY_IDS } from "@/lib/categoryDisplay";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UpdateSellerProfileSchema = z.object({
  categoriesServed: z.array(z.string()).optional(),
  serviceArea: z.string().optional(),
  companyName: z.string().min(1).optional(),
  fullName: z.string().min(1).optional(),
});

export async function PATCH(request: NextRequest) {
  return withErrorHandling(async () => {
    requireServerEnv();

    let user;
    try {
      user = await requireCurrentUserFromRequest(request);
    } catch {
      return jsonError("UNAUTHORIZED", "Authentication required", 401);
    }

    if (user.role !== "SELLER") {
      return jsonError("FORBIDDEN", "Seller access required", 403);
    }

    // Parse and validate body
    let body;
    try {
      body = await request.json();
    } catch {
      return jsonError("BAD_REQUEST", "Invalid JSON", 400);
    }

    const validation = UpdateSellerProfileSchema.safeParse(body);
    if (!validation.success) {
      return jsonError("BAD_REQUEST", "Invalid profile data", 400, validation.error.issues);
    }

    // CRITICAL: Convert labels to categoryIds (canonical ids only)
    let normalizedCategoryIds: string[] = [];
    if (validation.data.categoriesServed !== undefined) {
      const incomingCategories = validation.data.categoriesServed;
      
      // DEV-ONLY: Log incoming payload
      if (process.env.NODE_ENV === "development") {
        console.log("[SELLER_PROFILE_SAVE]", {
          sellerId: user.id,
          incomingCategories,
          incomingCount: incomingCategories.length,
        });
      }
      
      // Convert labels to categoryIds
      for (const cat of incomingCategories) {
        // If already a valid categoryId, use it
        if (CATEGORY_IDS.includes(cat as any)) {
          normalizedCategoryIds.push(cat);
        } else {
          // Try to convert label to categoryId using object access
          const categoryId = labelToCategoryId[cat as keyof typeof labelToCategoryId];
          if (categoryId) {
            normalizedCategoryIds.push(categoryId);
          } else {
            // Invalid category - log and skip (dev-only)
            if (process.env.NODE_ENV === "development") {
              console.warn("[SELLER_PROFILE_SAVE_INVALID_CATEGORY]", {
                sellerId: user.id,
                invalidCategory: cat,
              });
            }
          }
        }
      }
      
      // Remove duplicates
      normalizedCategoryIds = [...new Set(normalizedCategoryIds)];
      
      // DEV-ONLY: Log normalized result
      if (process.env.NODE_ENV === "development") {
        console.log("[SELLER_PROFILE_SAVE_NORMALIZED]", {
          sellerId: user.id,
          normalizedCategoryIds,
          normalizedCount: normalizedCategoryIds.length,
        });
      }
    }

    const prisma = getPrisma();
    
    // CRITICAL: Before allowing profile completion, ensure seller has a display name
    // Check if user already has companyName or fullName
    const currentUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { companyName: true, fullName: true },
    });
    
    // If updating categories (completing profile), validate display name exists
    if (validation.data.categoriesServed !== undefined && validation.data.categoriesServed.length > 0) {
      const hasDisplayName = 
        currentUser?.companyName?.trim() || 
        currentUser?.fullName?.trim() ||
        validation.data.companyName?.trim() ||
        validation.data.fullName?.trim();
      
      if (!hasDisplayName) {
        return jsonError(
          "BAD_REQUEST",
          "Company name or full name is required to complete your profile. Please provide a company name or full name.",
          400
        );
      }
    }
    
    // Update user profile with normalized categoryIds and optional display name fields
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        ...(validation.data.categoriesServed !== undefined && {
          categoriesServed: JSON.stringify(normalizedCategoryIds),
        }),
        ...(validation.data.serviceArea !== undefined && {
          serviceArea: validation.data.serviceArea,
        }),
        ...(validation.data.companyName !== undefined && {
          companyName: validation.data.companyName.trim(),
        }),
        ...(validation.data.fullName !== undefined && {
          fullName: validation.data.fullName.trim(),
        }),
      },
    });

    // Parse categoriesServed for response
    let categoriesServed: string[] = [];
    try {
      if (updated.categoriesServed) {
        categoriesServed = JSON.parse(updated.categoriesServed);
      }
    } catch {
      // Invalid JSON, treat as empty
    }

    // CRITICAL: profileComplete requires both categories AND display name
    const hasDisplayName = !!(updated.companyName?.trim() || updated.fullName?.trim());
    const hasCategories = !!(updated.categoriesServed && categoriesServed.length > 0);
    const profileComplete = updated.role === "SELLER" 
      ? (hasDisplayName && hasCategories)
      : true;
    
    return jsonOk({
      id: updated.id,
      email: updated.email,
      role: updated.role,
      categoriesServed,
      serviceArea: updated.serviceArea,
      profileComplete,
    });
  });
}

