import type { SupplierSearchMode } from "@/lib/search/getSearchMode";
import type { StorefrontLayoutMode } from "./types";

/**
 * Maps search mode to storefront layout.
 * REFINED uses the same exploration-first layout as BROAD (Sprint 1 decision).
 */
export function getStorefrontLayoutMode(
  searchMode: SupplierSearchMode,
  options?: { listingTitle?: string | null }
): StorefrontLayoutMode {
  if (options?.listingTitle?.trim()) {
    return "PRODUCT_FIRST";
  }
  if (searchMode === "EXACT") {
    return "PRODUCT_FIRST";
  }
  return "EXPLORATION";
}
