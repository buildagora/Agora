/**
 * Request Routing Engine
 * Routes requests to suppliers based on preferred suppliers and coverage eligibility
 * 
 * NO AI - Deterministic rules only
 */

// Removed getPreferredSuppliers import - use API/DB instead
import { getEligibleSuppliers } from "./supplierCoverage";
import { getSupplierCoverage } from "./supplierCoverage";
import { getSupplierMetrics } from "./supplierMetrics";
import { RFQRequest } from "./request";

/**
 * Routing result
 */
export interface RoutingResult {
  primary: string[]; // Preferred suppliers (capped)
  fallback: string[]; // Other eligible suppliers (capped)
}

/**
 * Routing configuration
 */
const ROUTING_CONFIG = {
  PRIMARY_MAX: 5, // Maximum number of preferred suppliers
  FALLBACK_MAX: 10, // Maximum number of fallback suppliers
} as const;

/**
 * Determine the request category from request items
 * Uses the first item's category if available, otherwise "unknown"
 * 
 * @param request Request object
 * @returns Category string
 */
function determineRequestCategory(request: RFQRequest): string {
  // Check if request has items
  if (!request.items || request.items.length === 0) {
    return "unknown";
  }

  // Use the first item's category if set
  const firstItem = request.items[0];
  if (firstItem.category && firstItem.category !== "unknown") {
    return firstItem.category;
  }

  // Default to "unknown"
  return "unknown";
}

/**
 * Extract ZIP code from delivery address
 * @param address Full delivery address
 * @returns ZIP code string or undefined
 */
function extractZipCode(address: string | undefined): string | undefined {
  if (!address) {
    return undefined;
  }

  // Try to find 5-digit ZIP code pattern
  const zipMatch = address.match(/\b(\d{5})(?:-\d{4})?\b/);
  if (zipMatch) {
    return zipMatch[1];
  }

  return undefined;
}

/**
 * Filter out inactive suppliers
 * @param sellerIds Array of seller IDs
 * @returns Array of active seller IDs
 */
function filterActiveSuppliers(sellerIds: string[]): string[] {
  return sellerIds.filter((sellerId) => {
    const coverage = getSupplierCoverage(sellerId);
    // If no coverage profile, exclude (safest approach)
    if (!coverage) {
      return false;
    }
    // Only include active suppliers
    return coverage.active;
  });
}

/**
 * Compute a routing score for a supplier based on metrics
 * Higher score = better routing priority
 * 
 * Scoring rules:
 * - Response rate: 0-1 scale, weight 3.0 (higher is better)
 * - Response time: inverse with max cap (lower is better), weight 2.0
 * - On-time confirm/delivery: penalty for low rates, weight -1.0 each
 * 
 * @param sellerId Seller ID
 * @returns Routing score (higher is better)
 */
function computeRoutingScore(sellerId: string): number {
  const metrics = getSupplierMetrics(sellerId, 30); // Use 30-day window for routing
  
  let score = 0;
  
  // Response rate: higher is better (0-1 scale)
  if (typeof metrics.responseRate === "number") {
    score += metrics.responseRate * 3.0;
  }
  
  // Response time: lower is better (inverse with max cap at 240 minutes)
  if (typeof metrics.medianResponseTimeMinutes === "number") {
    const maxTime = 240; // 4 hours
    const normalizedTime = Math.min(metrics.medianResponseTimeMinutes, maxTime);
    // Inverse: faster response = higher score
    // Formula: (maxTime - actualTime) / maxTime, scaled by weight
    const timeScore = (maxTime - normalizedTime) / maxTime;
    score += timeScore * 2.0;
  }
  
  // On-time confirm rate: penalty for low rates (< 0.7)
  if (typeof metrics.onTimeConfirmRate === "number") {
    if (metrics.onTimeConfirmRate < 0.7) {
      // Penalty: subtract based on how far below 0.7
      const penalty = (0.7 - metrics.onTimeConfirmRate) * 1.0;
      score -= penalty;
    }
  }
  
  // On-time delivery rate: penalty for low rates (< 0.7)
  if (typeof metrics.onTimeDeliveryRate === "number") {
    if (metrics.onTimeDeliveryRate < 0.7) {
      // Penalty: subtract based on how far below 0.7
      const penalty = (0.7 - metrics.onTimeDeliveryRate) * 1.0;
      score -= penalty;
    }
  }
  
  return score;
}

/**
 * Sort suppliers by routing score (higher is better)
 * Maintains stable sort: suppliers with same score keep original order
 * 
 * @param sellerIds Array of seller IDs to sort
 * @returns Sorted array (highest score first)
 */
function sortSuppliersByMetrics(sellerIds: string[]): string[] {
  // Create array of {sellerId, score} pairs
  const scored = sellerIds.map((sellerId) => ({
    sellerId,
    score: computeRoutingScore(sellerId),
  }));
  
  // Sort by score descending, then by sellerId for stability
  scored.sort((a, b) => {
    if (a.score !== b.score) {
      return b.score - a.score; // Higher score first
    }
    // Stable sort: maintain original order for same scores
    return sellerIds.indexOf(a.sellerId) - sellerIds.indexOf(b.sellerId);
  });
  
  return scored.map((item) => item.sellerId);
}

/**
 * Route suppliers for a request
 * Returns ordered lists of primary (preferred) and fallback suppliers
 * 
 * @param request Request object
 * @returns Routing result with primary and fallback seller IDs
 */
export function routeSuppliersForRequest(request: RFQRequest): RoutingResult {
  // Determine request category
  const requestCategory = determineRequestCategory(request);

  // Determine delivery mode and ZIP code
  const deliveryMode = request.delivery.mode; // "delivery" | "pickup"
  const deliveryZipCode = deliveryMode === "delivery" 
    ? extractZipCode(request.delivery.address)
    : undefined;

  // TODO: Replace with API call to /api/buyer/preferred-suppliers?categoryId=...
  // For now, return empty array deterministically (no legacy preferredSuppliers module)
  const preferredSellerIds: string[] = [];

  // Get all eligible suppliers by coverage (category + delivery mode + ZIP)
  const allEligibleSellerIds = getEligibleSuppliers(
    requestCategory,
    deliveryMode,
    deliveryZipCode
  );

  // Filter out inactive suppliers from both lists
  const activePreferred = filterActiveSuppliers(preferredSellerIds);
  const activeEligible = filterActiveSuppliers(allEligibleSellerIds);

  // Primary list: preferred suppliers that are also eligible by coverage
  // Intersection of preferred and eligible, filtered to active
  // NOTE: Preferred suppliers are NEVER demoted to fallback - they always stay in primary
  const eligibleSet = new Set(activeEligible);
  const primaryIntersection = activePreferred.filter((id) => eligibleSet.has(id));

  // Sort primary list by metrics (preferred suppliers stay in primary, but ordered by performance)
  // This ensures preferred suppliers with better metrics are dispatched first
  const primarySorted = sortSuppliersByMetrics(primaryIntersection);
  
  // Apply cap to primary list
  const primary = primarySorted.slice(0, ROUTING_CONFIG.PRIMARY_MAX);

  // Fallback list: eligible suppliers that are NOT in primary list
  const primarySetFinal = new Set(primary);
  const fallbackCandidates = activeEligible.filter((id) => !primarySetFinal.has(id));
  
  // Sort fallback list by metrics
  const fallbackSorted = sortSuppliersByMetrics(fallbackCandidates);
  
  // Apply cap to fallback list
  const fallback = fallbackSorted.slice(0, ROUTING_CONFIG.FALLBACK_MAX);

  return {
    primary,
    fallback,
  };
}

