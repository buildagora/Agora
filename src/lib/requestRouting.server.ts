import "server-only";
import type { RFQRequest } from "./request";
import { getBuyerProfileFromDb, getSupplierIndexFromDb } from "./routing/adapters.server";
import { getEligibleSuppliers, type EligibilityInput } from "./routing/eligibility";
import { labelToCategoryId, type CategoryId } from "./categoryIds";
import type { FulfillmentType } from "./routing/types";

/**
 * Routing result
 */
export type RoutingResult = {
  primary: string[]; // Preferred suppliers (capped)
  fallback: string[]; // Other eligible suppliers (capped)
};

/**
 * Routing configuration
 */
const ROUTING_CONFIG = {
  PRIMARY_MAX: 5, // Maximum number of preferred suppliers
  FALLBACK_MAX: 10, // Maximum number of fallback suppliers
} as const;

/**
 * Determine categoryId from request items
 * Uses the first item's category if available
 */
function determineCategoryId(request: RFQRequest): CategoryId | null {
  if (!request.items || request.items.length === 0) {
    return null;
  }

  const firstItem = request.items[0];
  if (!firstItem.category) {
    return null;
  }

  // Try to resolve category label to categoryId
  const categoryId = labelToCategoryId[firstItem.category as keyof typeof labelToCategoryId];
  if (categoryId) {
    return categoryId;
  }

  // If it's already a categoryId, validate it
  if (firstItem.category in labelToCategoryId || Object.values(labelToCategoryId).includes(firstItem.category as any)) {
    return firstItem.category as CategoryId;
  }

  return null;
}

/**
 * Determine fulfillment type from request delivery mode
 */
function determineFulfillmentType(request: RFQRequest): FulfillmentType {
  return request.delivery.mode === "delivery" ? "DELIVERY" : "PICKUP";
}

/**
 * Route suppliers for a request using DB-backed routing system
 * Returns ordered lists of primary (preferred) and fallback suppliers
 */
export async function routeSuppliersForRequestServer(request: RFQRequest): Promise<RoutingResult> {
  // Determine categoryId and fulfillmentType
  const categoryId = determineCategoryId(request);
  if (!categoryId) {
    // No category - return empty routing
    if (process.env.NODE_ENV === "development") {
      console.log("[ROUTING_DB]", {
        requestId: request.id,
        categoryId: null,
        preferredCount: 0,
        eligibleCount: 0,
        primaryCount: 0,
        fallbackCount: 0,
        reason: "No categoryId found in request",
      });
    }
    return { primary: [], fallback: [] };
  }

  const fulfillmentType = determineFulfillmentType(request);

  // Get buyer profile and supplier index from DB
  const buyerProfile = await getBuyerProfileFromDb(request.buyerId);
  const supplierIndex = await getSupplierIndexFromDb();

  // Build eligibility input
  const eligibilityInput: EligibilityInput = {
    categoryId,
    fulfillmentType,
    priority: "best_price", // Default priority
  };

  // Get eligible suppliers
  const eligibilityResult = getEligibleSuppliers(
    eligibilityInput,
    buyerProfile,
    supplierIndex,
    "not_sure"
  );

  const eligibleSuppliers = eligibilityResult.suppliers;
  const eligibleSupplierIds = eligibleSuppliers.map((s) => s.id);

  // Get preferred suppliers for this category
  const preferredSupplierIds = buyerProfile.preferredSuppliersByCategory[categoryId] || [];

  // Primary: preferred suppliers that are also eligible
  const eligibleSet = new Set(eligibleSupplierIds);
  const primaryCandidates = preferredSupplierIds.filter((id) => eligibleSet.has(id));

  // Sort primary by supplier order (deterministic - use ID order for stability)
  const primarySorted = primaryCandidates.sort((a, b) => a.localeCompare(b));
  const primary = primarySorted.slice(0, ROUTING_CONFIG.PRIMARY_MAX);

  // Fallback: eligible suppliers that are NOT in primary
  const primarySet = new Set(primary);
  const fallbackCandidates = eligibleSupplierIds.filter((id) => !primarySet.has(id));

  // Sort fallback by supplier order (deterministic - use ID order for stability)
  const fallbackSorted = fallbackCandidates.sort((a, b) => a.localeCompare(b));
  const fallback = fallbackSorted.slice(0, ROUTING_CONFIG.FALLBACK_MAX);

  // DEV-ONLY: Log routing results
  if (process.env.NODE_ENV === "development") {
    console.log("[ROUTING_DB]", {
      requestId: request.id,
      categoryId,
      preferredCount: preferredSupplierIds.length,
      eligibleCount: eligibleSupplierIds.length,
      primaryCount: primary.length,
      fallbackCount: fallback.length,
    });
  }

  return {
    primary,
    fallback,
  };
}


