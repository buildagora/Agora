import {
  searchCapabilities,
  type CapabilitySearchResult,
} from "@/lib/search/capabilitySearch";

export type SearchSupplierCapabilityProfileOptions = {
  originalQuery?: string;
  searchCapabilitiesFn?: typeof searchCapabilities;
};

/**
 * Supplier-scoped capability profile search for the router terminal fallback.
 * Reuses searchCapabilities scoring, threshold (>= 5), and max-rows logic.
 */
export async function searchSupplierCapabilityProfile(
  supplierId: string,
  query: string,
  options?: SearchSupplierCapabilityProfileOptions
): Promise<CapabilitySearchResult[]> {
  const searchFn = options?.searchCapabilitiesFn ?? searchCapabilities;
  const trimmedId = supplierId.trim();
  if (!trimmedId || !query.trim()) {
    return [];
  }

  const matches = await searchFn(query, {
    originalQuery: options?.originalQuery,
    supplierId: trimmedId,
  });

  return matches.filter((match) => match.supplierId === trimmedId);
}
