import type { CapabilitySearchResult } from "@/lib/search/capabilitySearch";
import type { SearchResultType } from "@/lib/search/classification/resultTypes";
import type { SupplierProductResult, SupplierProductSource } from "../types";
import {
  CAPABILITY_PROFILE_RANKING_SIGNALS,
} from "./profileResultContract";

export type MapCapabilityProfileResultsInput = {
  supplierId: string;
  source: SupplierProductSource;
};

function buildProfileTitle(match: CapabilitySearchResult): string {
  const parts: string[] = [];
  if (match.brand?.trim()) parts.push(match.brand.trim());
  if (match.productLine?.trim()) {
    parts.push(match.productLine.trim());
  } else if (match.subcategory?.trim()) {
    parts.push(match.subcategory.trim());
  } else if (match.categoryId?.trim()) {
    parts.push(match.categoryId.trim());
  }
  const label = parts.join(" — ") || "matching category";
  return `Likely carries: ${label}`;
}

function resolveProfileClassification(
  match: CapabilitySearchResult
): SearchResultType {
  if (match.brand?.trim()) {
    return "BRAND_PAGE";
  }
  return "CATEGORY_PAGE";
}

/**
 * Map scored capability rows to chain-compatible profile results.
 * Never fabricates SKU, inventory, pricing, or product imagery.
 */
export function mapCapabilityMatchesToProfileResults(
  matches: CapabilitySearchResult[],
  input: MapCapabilityProfileResultsInput
): SupplierProductResult[] {
  return matches.map((match) => ({
    supplierId: input.supplierId,
    title: buildProfileTitle(match),
    brand: match.brand?.trim() || null,
    imageUrl: null,
    price: null,
    productUrl: match.sourceUrl?.trim() || null,
    source: input.source,
    availability: "Likely carries",
    classification: resolveProfileClassification(match),
    score: match.score,
    rankingSignals: [...CAPABILITY_PROFILE_RANKING_SIGNALS],
  }));
}
