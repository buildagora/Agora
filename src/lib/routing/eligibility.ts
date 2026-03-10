/**
 * Eligibility Filter - Determines which suppliers are eligible for an RFQ
 */

import type { Supplier, BuyerProfile, Category, FulfillmentType } from "./types";
import { labelToCategoryId, categoryIdToLabel, type CategoryId } from "@/lib/categoryIds";

/**
 * Minimal typed input for eligibility checks
 * Replaces DraftRFQ to remove dependency on legacy category field
 */
export type EligibilityInput = {
  categoryId: CategoryId;
  fulfillmentType: FulfillmentType;
  location?: string;
  priority?: "fastest" | "best_price" | "preferred" | "not_sure";
};

export type EligibilityReason =
  | "NO_SUPPLIERS_IN_CATEGORY"
  | "SUPPLIERS_EXIST_BUT_INACTIVE"
  | "SUPPLIERS_EXIST_BUT_INACTIVE_OR_UNVERIFIED"
  | "NO_SUPPLIERS_MATCH_FULFILLMENT"
  | "NO_SUPPLIERS_MATCH_SERVICE_AREA"
  | "PREFERRED_SUPPLIERS_NOT_SET"
  | "PREFERRED_SUPPLIERS_NOT_ELIGIBLE"
  | null;

export type EligibilityFailureCode =
  | "CATEGORY_MISMATCH"
  | "INACTIVE_OR_UNSUBSCRIBED"
  | "NOT_VERIFIED"
  | "FULFILLMENT_MISMATCH"
  | "SERVICE_AREA_MISMATCH"
  | "CAPACITY_PAUSED"
  | "EXCLUDED"
  | "OTHER";

export interface SupplierEligibilityCheck {
  supplierId: string;
  eligible: boolean;
  failed: EligibilityFailureCode[];
  failedDetails?: {
    categoryMismatch?: { expected: string; got: string[] };
    fulfillmentMismatch?: { expected: FulfillmentType; supportsDelivery: boolean; supportsPickup: boolean };
    inactive?: { isActive: boolean; unsubscribed?: boolean };
    notVerified?: { isVerified: boolean; isEmailVerified?: boolean };
    capacityPaused?: { capacityPaused: boolean };
    excluded?: { isExcluded: boolean };
  };
}

export interface EligibilityResult {
  suppliers: Supplier[];
  reason: EligibilityReason;
  eligibilityDebug: {
    totalInCategory: number;
    activeCount: number;
    matchesFulfillment: number;
    matchesServiceArea: number;
    preferredConfigured: number;
    preferredEligible: number;
    failedBreakdown?: {
      inactive: number;
      notVerified: number;
      missingFulfillment: number;
      excluded: number;
      capacityPaused: number;
      supplierIds?: {
        inactive: string[];
        notVerified: string[];
        missingFulfillment: string[];
        excluded: string[];
        capacityPaused: string[];
      };
    };
    // V1 FIX: Per-supplier eligibility results for preferred routing diagnostics
    preferredSupplierEligibilityChecks?: SupplierEligibilityCheck[];
  };
}

/**
 * Get all eligible suppliers for an RFQ with detailed reason codes and debug info
 * Filters by: active, verified, category match, fulfillment match, not excluded
 */
export function getEligibleSuppliers(
  input: EligibilityInput,
  buyerProfile: BuyerProfile,
  supplierIndex: Supplier[],
  intent?: "preferred" | "fastest" | "best_price" | "not_sure"
): EligibilityResult {
  const debug: EligibilityResult["eligibilityDebug"] = {
    totalInCategory: 0,
    activeCount: 0,
    matchesFulfillment: 0,
    matchesServiceArea: 0,
    preferredConfigured: 0,
    preferredEligible: 0,
    failedBreakdown: {
      inactive: 0,
      notVerified: 0,
      missingFulfillment: 0,
      excluded: 0,
      capacityPaused: 0,
      supplierIds: {
        inactive: [],
        notVerified: [],
        missingFulfillment: [],
        excluded: [],
        capacityPaused: [],
      },
    },
  };

  // Use categoryId directly from input (no fallback conversion needed)
  const requestedCategoryId: CategoryId = input.categoryId;
  const fulfillmentType = input.fulfillmentType;
  
  // requestedCategoryId and fulfillmentType are guaranteed from EligibilityInput type
  const excludedIds = new Set(buyerProfile.excludedSuppliers || []);
  // CRITICAL: Use categoryId (not category label) to index preferredSuppliersByCategory
  const preferredSupplierIds = buyerProfile.preferredSuppliersByCategory[requestedCategoryId] || [];

  // HARD DEBUG: Log supplier source and matching
  const supplierSourceTableName = "agora:suppliers:v1 (localStorage)";
  console.log("🔍 ELIGIBILITY_DEBUG_START", {
    supplierSourceTableName,
    suppliersLength: supplierIndex.length,
    firstSupplierSample: supplierIndex.length > 0 ? {
      id: supplierIndex[0].id,
      name: supplierIndex[0].name,
      categoryIds: supplierIndex[0].categoryIds,
      categories: supplierIndex[0].categories,
      isActive: supplierIndex[0].isActive,
      isVerified: supplierIndex[0].isVerified,
    } : null,
    requestedCategoryId,
    requestedCategoryLabel: categoryIdToLabel[requestedCategoryId],
  });

  // Validate supplier source
  if (supplierIndex.length === 0) {
    const error = new Error("Supplier source query returned 0; check model/filter/scope");
    console.error("❌ SUPPLIER_SOURCE_ERROR", {
      supplierSourceTableName,
      error: error.message,
      actionItems: [
        "1. Check that suppliers exist in localStorage key: agora:suppliers:v1",
        "2. Verify getSuppliers() function is working",
        "3. Check that supplier data is not empty",
      ],
    });
    throw error;
  }

  // Step 1: Filter by categoryId (canonical matching)
  // requestedCategoryId is guaranteed to be non-null from EligibilityInput type

  // Match by categoryId (canonical only - no label fallbacks)
  const inCategory = supplierIndex.filter((supplier) => {
    // Match by categoryId only
    return supplier.categoryIds && supplier.categoryIds.includes(requestedCategoryId);
  });
  debug.totalInCategory = inCategory.length;
  
  // Enhanced logging
  if (process.env.NODE_ENV === "development") {
    const categoryIdMatches = supplierIndex.filter(s => 
      s.categoryIds && s.categoryIds.includes(requestedCategoryId)
    );
    
    console.log("🔍 CATEGORY_MATCHING_RESULT", {
      requestedCategoryId,
      requestedCategoryLabel: categoryIdToLabel[requestedCategoryId],
      categoryIdMatches: categoryIdMatches.length,
      totalMatches: inCategory.length,
      categoryIdMatchSuppliers: categoryIdMatches.map(s => ({ 
        id: s.id, 
        name: s.name, 
        categoryIds: s.categoryIds,
        categories: s.categories,
      })),
    });
    
    // If suppliers exist but none match, log detailed breakdown
    if (supplierIndex.length > 0 && inCategory.length === 0) {
      console.error("❌ NO_MATCHING_SUPPLIERS", {
        requestedCategoryId,
        requestedCategoryLabel: categoryIdToLabel[requestedCategoryId],
        allSupplierCategoryIds: supplierIndex.map(s => ({
          id: s.id,
          name: s.name,
          categoryIds: s.categoryIds,
          categories: s.categories,
        })),
      });
    }
  }
  
  if (inCategory.length === 0) {
    return {
      suppliers: [],
      reason: "NO_SUPPLIERS_IN_CATEGORY",
      eligibilityDebug: debug,
    };
  }

  // Step 2: Filter to active (V1: do NOT block on isEmailVerified)
  // Track which suppliers fail each gate for debugging
  // SCHEMA MAPPING (from adapters.ts):
  // - isActive: !storageSupplier.unsubscribed (supplier is inactive if unsubscribed === true)
  // - isVerified: storageSupplier.isEmailVerified !== false (logged but not blocking in V1)
  const inactiveIds: string[] = [];
  const notVerifiedIds: string[] = [];
  
  const active = inCategory.filter((supplier) => {
    // Check isActive (derived from !unsubscribed in adapters)
    if (!supplier.isActive) {
      inactiveIds.push(supplier.id);
      return false;
    }
    // V1: Log unverified but do NOT exclude
    if (!supplier.isVerified) {
      notVerifiedIds.push(supplier.id);
      // Continue - do not return false
    }
    return true;
  });
  
  debug.activeCount = active.length;
  debug.failedBreakdown!.inactive = inactiveIds.length;
  debug.failedBreakdown!.notVerified = notVerifiedIds.length;
  
  // In dev mode, track supplier IDs that failed each gate
  if (process.env.NODE_ENV === "development") {
    debug.failedBreakdown!.supplierIds!.inactive = inactiveIds;
    debug.failedBreakdown!.supplierIds!.notVerified = notVerifiedIds;
    if (notVerifiedIds.length > 0) {
      console.log("⚠️ UNVERIFIED_SUPPLIERS (not blocking)", {
        count: notVerifiedIds.length,
        supplierIds: notVerifiedIds,
      });
    }
  }

  if (active.length === 0) {
    // Determine more specific reason
    const reason: EligibilityReason = inactiveIds.length > 0 
      ? "SUPPLIERS_EXIST_BUT_INACTIVE"
      : "NO_SUPPLIERS_IN_CATEGORY";
    return {
      suppliers: [],
      reason,
      eligibilityDebug: debug,
    };
  }

  // Step 3: Filter by fulfillment type (with defaults)
  const missingFulfillmentIds: string[] = [];
  
  const matchesFulfillment = active.filter((supplier) => {
    // Default to true if not specified (V1: permissive defaults)
    const supportsDelivery = supplier.supportsDelivery !== false;
    const supportsPickup = supplier.supportsPickup !== false;
    
    if (fulfillmentType === "DELIVERY" && !supportsDelivery) {
      missingFulfillmentIds.push(supplier.id);
      return false;
    }
    if (fulfillmentType === "PICKUP" && !supportsPickup) {
      missingFulfillmentIds.push(supplier.id);
      return false;
    }
    return true;
  });
  
  debug.matchesFulfillment = matchesFulfillment.length;
  debug.failedBreakdown!.missingFulfillment = missingFulfillmentIds.length;
  
  if (process.env.NODE_ENV === "development") {
    debug.failedBreakdown!.supplierIds!.missingFulfillment = missingFulfillmentIds;
  }

  if (matchesFulfillment.length === 0) {
    return {
      suppliers: [],
      reason: "NO_SUPPLIERS_MATCH_FULFILLMENT",
      eligibilityDebug: debug,
    };
  }

  // Step 4: Filter by service area (only for DELIVERY, skip for PICKUP)
  // V1: Service area filtering is placeholder - always passes for now
  // For PICKUP, service area doesn't apply
  const matchesServiceArea = fulfillmentType === "PICKUP" 
    ? matchesFulfillment // PICKUP: skip service area, use matchesFulfillment count
    : matchesFulfillment; // DELIVERY: V1 placeholder (no geo-filtering yet)
  debug.matchesServiceArea = matchesServiceArea.length;

  // Step 5: Remove excluded suppliers
  const excludedIdsList: string[] = [];
  const notExcluded = matchesServiceArea.filter((supplier) => {
    if (excludedIds.has(supplier.id)) {
      excludedIdsList.push(supplier.id);
      return false;
    }
    return true;
  });
  
  debug.failedBreakdown!.excluded = excludedIdsList.length;
  if (process.env.NODE_ENV === "development") {
    debug.failedBreakdown!.supplierIds!.excluded = excludedIdsList;
  }

  // Step 6: Remove capacity-paused suppliers
  const capacityPausedIds: string[] = [];
  const available = notExcluded.filter((supplier) => {
    if (supplier.capacityPaused === true) {
      capacityPausedIds.push(supplier.id);
      return false;
    }
    return true;
  });
  
  debug.failedBreakdown!.capacityPaused = capacityPausedIds.length;
  if (process.env.NODE_ENV === "development") {
    debug.failedBreakdown!.supplierIds!.capacityPaused = capacityPausedIds;
  }

  // Step 7: Track preferred supplier stats (but don't filter here - planner handles intent)
  debug.preferredConfigured = preferredSupplierIds.length;
  
  // V1 FIX: Check eligibility per preferred supplier with detailed failure reasons
  const preferredSuppliersInIndex = supplierIndex.filter((s) =>
    preferredSupplierIds.includes(s.id)
  );
  
  const eligibilityResultsPerPreferredSupplier: SupplierEligibilityCheck[] = preferredSuppliersInIndex.map((supplier) => {
    const failures: EligibilityFailureCode[] = [];
    const failedDetails: SupplierEligibilityCheck["failedDetails"] = {};
    
    // Check 1: Category match
    const hasCategoryMatch = 
      (supplier.categoryIds && supplier.categoryIds.includes(requestedCategoryId)) ||
      false; // CategoryId-only matching (no label fallback)
    if (!hasCategoryMatch) {
      failures.push("CATEGORY_MISMATCH");
      failedDetails.categoryMismatch = {
        expected: requestedCategoryId,
        got: supplier.categoryIds || [], // CategoryId-only (no label fallback)
      };
    }
    
    // Check 2: Active status
    if (!supplier.isActive) {
      failures.push("INACTIVE_OR_UNSUBSCRIBED");
      failedDetails.inactive = {
        isActive: supplier.isActive,
      };
    }
    
    // Check 3: Verified (not blocking, but track)
    if (!supplier.isVerified) {
      failures.push("NOT_VERIFIED");
      failedDetails.notVerified = {
        isVerified: supplier.isVerified,
      };
    }
    
    // Check 4: Fulfillment compatibility
    const supportsDelivery = supplier.supportsDelivery !== false;
    const supportsPickup = supplier.supportsPickup !== false;
    if (fulfillmentType === "DELIVERY" && !supportsDelivery) {
      failures.push("FULFILLMENT_MISMATCH");
      failedDetails.fulfillmentMismatch = {
        expected: "DELIVERY",
        supportsDelivery,
        supportsPickup,
      };
    }
    if (fulfillmentType === "PICKUP" && !supportsPickup) {
      failures.push("FULFILLMENT_MISMATCH");
      failedDetails.fulfillmentMismatch = {
        expected: "PICKUP",
        supportsDelivery,
        supportsPickup,
      };
    }
    
    // Check 5: Service area (placeholder for now)
    // V1: Service area always passes, but track for future
    
    // Check 6: Capacity paused
    if (supplier.capacityPaused === true) {
      failures.push("CAPACITY_PAUSED");
      failedDetails.capacityPaused = {
        capacityPaused: true,
      };
    }
    
    // Check 7: Excluded
    if (excludedIds.has(supplier.id)) {
      failures.push("EXCLUDED");
      failedDetails.excluded = {
        isExcluded: true,
      };
    }
    
    // Supplier is eligible if it passes all checks (or only has NOT_VERIFIED which is non-blocking)
    const blockingFailures = failures.filter(f => f !== "NOT_VERIFIED");
    const eligible = blockingFailures.length === 0;
    
    return {
      supplierId: supplier.id,
      eligible,
      failed: failures,
      failedDetails: Object.keys(failedDetails).length > 0 ? failedDetails : undefined,
    };
  });
  
  const preferredEligible = available.filter((supplier) =>
    preferredSupplierIds.includes(supplier.id)
  );
  debug.preferredEligible = preferredEligible.length;
  
  // V1 FIX: Store per-supplier eligibility checks in debug
  // Only include checks for preferred suppliers that exist in supplierIndex
  // Add debug properties
  debug.preferredSupplierEligibilityChecks = eligibilityResultsPerPreferredSupplier;

  // For "preferred" intent: check if preferred suppliers are configured and eligible
  if (intent === "preferred") {
    if (preferredSupplierIds.length === 0) {
      // No preferred suppliers configured, but return all eligible for fallback
      return {
        suppliers: available,
        reason: "PREFERRED_SUPPLIERS_NOT_SET",
        eligibilityDebug: debug,
      };
    } else if (preferredEligible.length === 0) {
      // Preferred suppliers exist but none are eligible, return all eligible for fallback
      return {
        suppliers: available,
        reason: "PREFERRED_SUPPLIERS_NOT_ELIGIBLE",
        eligibilityDebug: debug,
      };
    }
    // Preferred suppliers are eligible - return them (planner will use these)
    return {
      suppliers: preferredEligible,
      reason: null,
      eligibilityDebug: debug,
    };
  }

  // For "fastest", "best_price", or "not_sure": return all eligible suppliers
  // Planner will handle fastest/preferred filtering from this list
  // Determine accurate reason if no eligible suppliers
  let finalReason: EligibilityReason = null;
  if (available.length === 0) {
    // Determine reason based on which gate failed
    if (debug.totalInCategory > 0 && debug.activeCount === 0) {
      finalReason = "SUPPLIERS_EXIST_BUT_INACTIVE";
    } else if (debug.activeCount > 0 && debug.matchesFulfillment === 0) {
      finalReason = "NO_SUPPLIERS_MATCH_FULFILLMENT";
    } else if (fulfillmentType === "DELIVERY" && debug.matchesServiceArea === 0) {
      finalReason = "NO_SUPPLIERS_MATCH_SERVICE_AREA";
    } else {
      finalReason = "NO_SUPPLIERS_IN_CATEGORY";
    }
  }
  
  return {
    suppliers: available,
    reason: finalReason,
    eligibilityDebug: debug,
  };
}
