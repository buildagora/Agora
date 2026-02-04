/**
 * Supplier Coverage Profile
 * Minimal profile for supplier eligibility matching
 */

// Removed storage imports - supplier coverage will be stored in database
// For now, return empty/null until API is implemented

/**
 * Supplier coverage profile
 */
export interface SupplierCoverage {
  sellerId: string; // Seller user ID
  categories: string[]; // Material categories served (e.g., ["Roofing", "Lumber"])
  serviceZipPrefixes?: string[]; // ZIP code prefixes served (e.g., ["358", "350"] for delivery)
  fulfills?: ("delivery" | "pickup")[]; // Fulfillment modes supported (optional)
  active: boolean; // Whether supplier is currently active/accepting requests
  updatedAt: string; // ISO timestamp of last update
}

/**
 * Get coverage profile for a seller
 * @param sellerId Seller user ID
 * @returns Coverage profile or null if not found
 */
export function getSupplierCoverage(sellerId: string): SupplierCoverage | null {
  // TODO: Load from database API when SupplierCoverage model exists
  return null;
}

/**
 * Save or update supplier coverage profile
 * @param coverage Coverage profile to save
 */
export function saveSupplierCoverage(coverage: SupplierCoverage): void {
  // Validate sellerId
  if (!coverage.sellerId) {
    throw new Error("saveSupplierCoverage: sellerId is required");
  }

  // Validate categories
  if (!Array.isArray(coverage.categories) || coverage.categories.length === 0) {
    throw new Error("saveSupplierCoverage: categories must be a non-empty array");
  }

  // Normalize ZIP prefixes (remove non-digits, ensure 3-5 digits)
  const normalizedZipPrefixes = coverage.serviceZipPrefixes
    ? coverage.serviceZipPrefixes
        .map((prefix) => prefix.replace(/\D/g, "")) // Remove non-digits
        .filter((prefix) => prefix.length >= 3 && prefix.length <= 5) // Valid ZIP prefix length
        .map((prefix) => prefix.substring(0, 5)) // Take first 5 digits max
    : undefined;

  // Ensure fulfills is valid array if provided
  const normalizedFulfills = coverage.fulfills
    ? coverage.fulfills.filter((f) => f === "delivery" || f === "pickup")
    : undefined;

  // Create normalized coverage
  const normalized: SupplierCoverage = {
    ...coverage,
    serviceZipPrefixes: normalizedZipPrefixes && normalizedZipPrefixes.length > 0 ? normalizedZipPrefixes : undefined,
    fulfills: normalizedFulfills && normalizedFulfills.length > 0 ? normalizedFulfills : undefined,
    updatedAt: new Date().toISOString(),
  };

  // TODO: Save to database API when SupplierCoverage model exists
  // For now, no-op (coverage is not persisted)
}

/**
 * Extract ZIP code prefix from a full address or ZIP code string
 * @param addressOrZip Full address or ZIP code (e.g., "204 Beirne Ave NW, Huntsville, AL 35801" or "35801")
 * @returns ZIP prefix (first 3-5 digits) or null if not found
 */
function extractZipPrefix(addressOrZip: string): string | null {
  // Remove all non-digit characters except spaces
  const cleaned = addressOrZip.trim();
  
  // Try to find 5-digit ZIP code pattern
  const zipMatch = cleaned.match(/\b(\d{5})(?:-\d{4})?\b/);
  if (zipMatch) {
    return zipMatch[1].substring(0, 5); // Return full 5-digit ZIP
  }
  
  // Try to find 3-digit prefix
  const prefixMatch = cleaned.match(/\b(\d{3})\d{0,2}\b/);
  if (prefixMatch) {
    return prefixMatch[1];
  }
  
  return null;
}

/**
 * Check if a ZIP code matches any of the service ZIP prefixes
 * @param zipCode ZIP code to check (can be full address or just ZIP)
 * @param serviceZipPrefixes Array of ZIP prefixes to match against
 * @returns true if ZIP matches any prefix
 */
function matchesZipPrefix(zipCode: string | undefined, serviceZipPrefixes: string[] | undefined): boolean {
  // If no ZIP code provided, cannot match (return false for safety)
  if (!zipCode) {
    return false;
  }

  // If no service ZIP prefixes defined, cannot match (return false for safety)
  if (!serviceZipPrefixes || serviceZipPrefixes.length === 0) {
    return false;
  }

  const zipPrefix = extractZipPrefix(zipCode);
  if (!zipPrefix) {
    return false; // Cannot extract ZIP, cannot match
  }

  // Check if ZIP prefix matches any service prefix
  // Match if service prefix is a prefix of the ZIP code (e.g., "358" matches "35801")
  return serviceZipPrefixes.some((servicePrefix) => {
    const normalizedServicePrefix = servicePrefix.replace(/\D/g, "").substring(0, 5);
    const normalizedZip = zipPrefix.substring(0, 5);
    // Match if ZIP starts with service prefix (e.g., "35801" starts with "358")
    return normalizedZip.startsWith(normalizedServicePrefix);
  });
}

/**
 * Get eligible suppliers for a request
 * 
 * @param requestCategory Material category (e.g., "Roofing")
 * @param deliveryMode "delivery" | "pickup"
 * @param deliveryZipCode Optional ZIP code for delivery (required if deliveryMode === "delivery")
 * @returns Array of eligible seller IDs
 */
export function getEligibleSuppliers(
  requestCategory: string,
  deliveryMode: "delivery" | "pickup",
  deliveryZipCode?: string
): string[] {
  // TODO: Load sellers from database API instead of getAllUsers
  // Removed storage dependency
  const suppliers: any[] = [];
  const allSellers = suppliers.filter((s: any) => s.role === "SELLER" || !s.role);

  const eligibleSellerIds: string[] = [];

  for (const seller of allSellers) {
    // Get coverage profile
    const coverage = getSupplierCoverage(seller.id);

    if (coverage) {
      // Has coverage profile - use it for matching

      // Check if active
      if (!coverage.active) {
        continue; // Skip inactive suppliers
      }

      // Check category match
      if (!coverage.categories.includes(requestCategory)) {
        continue; // Category doesn't match
      }

      // Check fulfillment mode
      if (coverage.fulfills && coverage.fulfills.length > 0) {
        if (!coverage.fulfills.includes(deliveryMode)) {
          continue; // Doesn't fulfill this mode
        }
      }

      // For delivery, check ZIP code match
      if (deliveryMode === "delivery") {
        if (coverage.serviceZipPrefixes && coverage.serviceZipPrefixes.length > 0) {
          // Has ZIP restrictions - must match
          if (!deliveryZipCode) {
            continue; // ZIP required but not provided
          }
          if (!matchesZipPrefix(deliveryZipCode, coverage.serviceZipPrefixes)) {
            continue; // ZIP doesn't match
          }
        }
        // If no ZIP prefixes defined, assume they serve all areas (included)
      }

      // All checks passed - eligible
      eligibleSellerIds.push(seller.id);
    } else {
      // No coverage profile - DEFAULT BEHAVIOR: EXCLUDE
      // Safest approach: require explicit coverage setup
      // This prevents routing to suppliers who haven't configured their coverage
      continue;
    }
  }

  return eligibleSellerIds;
}

/**
 * Initialize coverage from seller's existing categoriesServed
 * Useful for migration or initial setup
 * @param sellerId Seller user ID
 * @returns Created coverage profile or null if seller not found or has no categories
 */
export function initializeCoverageFromCategories(sellerId: string): SupplierCoverage | null {
  // TODO: Load seller from database API instead of getAllUsers
  // Removed storage dependency
  const suppliers: any[] = [];
  const seller = suppliers.find((s: any) => s.id === sellerId);

  if (!seller) {
    return null;
  }

  // Check if coverage already exists
  const existing = getSupplierCoverage(sellerId);
  if (existing) {
    return existing; // Don't overwrite existing coverage
  }

  // Check if seller has categoriesServed
  if (!seller.categoriesServed || seller.categoriesServed.length === 0) {
    return null; // No categories to initialize from
  }

  // Create default coverage from categoriesServed
  const coverage: SupplierCoverage = {
    sellerId: seller.id,
    categories: seller.categoriesServed,
    active: true,
    // No ZIP restrictions (serves all areas)
    // No fulfills restriction (serves both delivery and pickup)
    updatedAt: new Date().toISOString(),
  };

  saveSupplierCoverage(coverage);
  return coverage;
}

/**
 * List all supplier coverage profiles
 * @returns Array of all coverage profiles
 */
export function listAllSupplierCoverage(): SupplierCoverage[] {
  // TODO: Load sellers from database API instead of getAllUsers
  // Removed storage dependency
  const suppliers: any[] = [];
  const allSellers = suppliers.filter((s: any) => s.role === "SELLER" || !s.role);

  const allCoverage: SupplierCoverage[] = [];

  for (const seller of allSellers) {
    const coverage = getSupplierCoverage(seller.id);
    if (coverage) {
      allCoverage.push(coverage);
    }
  }

  return allCoverage;
}

