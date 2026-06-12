import type { SearchResultType } from "@/lib/search/classification/resultTypes";
import type { SupplierProductResult } from "../types";

/** Ranking signals that mark a row as capability-inferred, not live inventory. */
export const CAPABILITY_PROFILE_RANKING_SIGNALS = [
  "capability_profile",
  "inferred_match",
  "no_live_inventory",
] as const;

export type CapabilityProfileRankingSignal =
  (typeof CAPABILITY_PROFILE_RANKING_SIGNALS)[number];

/** Classifications allowed for capability profile rows — never PRODUCT_PAGE. */
export const CAPABILITY_PROFILE_CLASSIFICATIONS: SearchResultType[] = [
  "CATEGORY_PAGE",
  "BRAND_PAGE",
];

export function isCapabilityProfileResult(
  result: SupplierProductResult
): boolean {
  const signals = result.rankingSignals ?? [];
  return (
    CAPABILITY_PROFILE_RANKING_SIGNALS.every((s) => signals.includes(s)) &&
    result.price == null &&
    (result.imageUrl == null || result.imageUrl === "") &&
    result.classification !== "PRODUCT_PAGE" &&
    CAPABILITY_PROFILE_CLASSIFICATIONS.includes(
      result.classification ?? "UNKNOWN"
    )
  );
}
