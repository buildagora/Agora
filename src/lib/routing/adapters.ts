/**
 * Routing Adapters - Bridge between routing system and existing data stores
 * 
 * TODO: Replace getSuppliers() with API call to /api/suppliers
 * TODO: Replace getCurrentUser() with useAuth() hook (this file needs to be client-side or refactored)
 * TODO: Replace getPreferredSuppliers() with API call to /api/buyer/preferred-suppliers
 */

import type { BuyerProfile, Supplier, Category } from "./types";
import { getCurrentUser } from "@/lib/auth/client";
// REMOVED: getSuppliers import - using API instead (getSupplierIndex now returns empty array)
import type { Supplier as StorageSupplier } from "@/lib/types";
import { labelToCategoryId, categoryIdToLabel, type CategoryId } from "@/lib/categoryIds";

// Derive CATEGORY_IDS from canonical categoryIdToLabel object
const CATEGORY_IDS = Object.keys(categoryIdToLabel) as CategoryId[];

/**
 * Get buyer profile from current user
 * Reads preferred suppliers from storage and resolves references
 */
export async function getBuyerProfile(): Promise<BuyerProfile> {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    throw new Error("No current user");
  }

  // CRITICAL: Use CategoryId keys only (canonical ids like "roofing", "hvac")
  // TODO: Replace with API call to /api/buyer/preferred-suppliers when endpoint exists
  // For now, return empty mapping deterministically (no require() fallbacks)
  const preferredSuppliersByCategory: Record<CategoryId, string[]> = {} as Record<CategoryId, string[]>;
  const defaultStrategyByCategory: Record<CategoryId, "best_price" | "fastest" | "preferred"> = {} as Record<CategoryId, "best_price" | "fastest" | "preferred">;
  
  // DEV-ONLY: Runtime assertion - validate all keys are valid CategoryIds
  // (This check is defensive in case future code adds invalid keys)
  if (process.env.NODE_ENV === "development") {
    // Check preferredSuppliersByCategory
    const invalidPreferredKeys = Object.keys(preferredSuppliersByCategory).filter(
      key => !CATEGORY_IDS.includes(key as CategoryId)
    );
    if (invalidPreferredKeys.length > 0) {
      console.error("❌ INVALID_CATEGORY_KEYS", {
        invalidKeys: invalidPreferredKeys,
        validCategoryIds: CATEGORY_IDS,
        message: "Dropping invalid category keys from preferredSuppliersByCategory",
      });
      for (const invalidKey of invalidPreferredKeys) {
        delete preferredSuppliersByCategory[invalidKey as CategoryId];
      }
    }
    
    // Check defaultStrategyByCategory
    const invalidStrategyKeys = Object.keys(defaultStrategyByCategory).filter(
      key => !CATEGORY_IDS.includes(key as CategoryId)
    );
    if (invalidStrategyKeys.length > 0) {
      console.error("❌ INVALID_CATEGORY_KEYS", {
        invalidKeys: invalidStrategyKeys,
        validCategoryIds: CATEGORY_IDS,
        message: "Dropping invalid category keys from defaultStrategyByCategory",
      });
      for (const invalidKey of invalidStrategyKeys) {
        delete defaultStrategyByCategory[invalidKey as CategoryId];
      }
    }
  }

  return {
    id: currentUser.id,
    preferredSuppliersByCategory,
    excludedSuppliers: [],
    defaultStrategyByCategory,
  };
}

/**
 * Convert storage supplier to routing supplier
 * Normalizes categories to canonical form
 */
function convertSupplier(storageSupplier: StorageSupplier): Supplier {
  // Extract categoryIds: prefer categoryIds if present, otherwise convert from categories
  const categoryIds: string[] = [];
  const normalizedCategories: Category[] = [];
  const seenIds = new Set<string>();
  const seenLabels = new Set<string>();
  
  // If supplier has categoryIds, use them directly
  if (storageSupplier.categoryIds && storageSupplier.categoryIds.length > 0) {
    for (const catId of storageSupplier.categoryIds) {
      if (catId && !seenIds.has(catId)) {
        // Type guard: ensure catId is a valid CategoryId
        if (catId in categoryIdToLabel) {
          categoryIds.push(catId);
          seenIds.add(catId);
          // Also add display label for backward compatibility
          const label = categoryIdToLabel[catId as CategoryId];
          if (label && !seenLabels.has(label)) {
            normalizedCategories.push(label as Category);
            seenLabels.add(label);
          }
        }
      }
    }
  }
  
  // Also process legacy categories array and convert to categoryIds
  for (const cat of (storageSupplier.categories || [])) {
    const categoryId = labelToCategoryId[cat as keyof typeof labelToCategoryId] as CategoryId | undefined;
    if (categoryId && !seenIds.has(categoryId)) {
      categoryIds.push(categoryId);
      seenIds.add(categoryId);
      // Also add display label for backward compatibility (from categoryId, not normalized label)
      if (categoryId in categoryIdToLabel) {
        const label = categoryIdToLabel[categoryId as CategoryId];
        if (label && !seenLabels.has(label)) {
          normalizedCategories.push(label as Category);
          seenLabels.add(label);
        }
      }
    }
  }
  
  // Enhanced logging
  if (process.env.NODE_ENV === "development") {
    console.log("🔄 SUPPLIER_CONVERSION", {
      supplierId: storageSupplier.id,
      supplierName: storageSupplier.name,
      originalCategories: storageSupplier.categories,
      originalCategoryIds: storageSupplier.categoryIds,
      convertedCategoryIds: categoryIds,
      convertedCategories: normalizedCategories,
    });
  }
  
  // If no categories/categoryIds, log a warning
  if (categoryIds.length === 0) {
    console.error("❌ SUPPLIER_HAS_NO_CATEGORIES", {
      supplierId: storageSupplier.id,
      supplierName: storageSupplier.name,
      originalCategories: storageSupplier.categories,
      originalCategoryIds: storageSupplier.categoryIds,
    });
  }
  
  const converted: Supplier = {
    id: storageSupplier.id,
    name: storageSupplier.name,
    email: storageSupplier.email || null,
    categories: normalizedCategories, // Legacy: for backward compatibility
    categoryIds: categoryIds, // NEW: canonical IDs
    isActive: !storageSupplier.unsubscribed, // Active if not unsubscribed
    isVerified: storageSupplier.isEmailVerified !== false, // Default to true if not specified
    serviceAreas: [], // Placeholder for future geo-matching
    supportsDelivery: true, // Default to true, can be extended
    supportsPickup: true, // Default to true, can be extended
    slaMinutes: null, // V1: No SLA data yet, can be extended
    capacityPaused: false, // V1: No capacity tracking yet
  };
  
  return converted;
}

/**
 * Get supplier index
 * NEW FOUNDATION: Should load from API/DB, not localStorage
 * TODO: Replace with API call to /api/suppliers when Supplier model exists
 * For now, returns empty array to prevent localStorage dependency
 */
export function getSupplierIndex(): Supplier[] {
  // TODO: Load from API when Supplier model exists
  // const res = await fetch("/api/suppliers", { credentials: "include" });
  // return await res.json();
  
  // TEMPORARY: Return empty array until API exists
  // This prevents localStorage dependency and ensures deterministic behavior
  if (process.env.NODE_ENV === "development") {
    console.warn("⚠️ getSupplierIndex() returning empty array - API route not yet implemented");
  }
  
  return [];
  
  // REMOVED: localStorage reading and runtime migration
  // - Removed getSuppliers() call (localStorage dependency)
  // - Removed supplierMigration require() (runtime migration dependency)
  // - Removed all localStorage-based supplier loading
}

/**
 * 
 * TODO: Replace getSuppliers() with API call to /api/suppliers
 * TODO: Replace getCurrentUser() with useAuth() hook (this file needs to be client-side or refactored)
 * TODO: Replace getPreferredSuppliers() with API call to /api/buyer/preferred-suppliers
 */
