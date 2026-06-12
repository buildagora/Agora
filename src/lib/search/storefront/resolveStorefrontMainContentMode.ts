import type { StorefrontTier } from "./types";

export type StorefrontMainContentMode =
  | "LIVE_PRODUCTS"
  | "HYBRID"
  | "CAPABILITY_BROWSE";

/**
 * Determines what the unified main content slot renders.
 * Layout is identical for all tiers — only this mode changes.
 */
export function resolveStorefrontMainContentMode(input: {
  tier: StorefrontTier;
  productCount: number;
  capabilityProfileCount: number;
}): StorefrontMainContentMode {
  const { tier, productCount, capabilityProfileCount } = input;

  if (tier === "CAPABILITY") {
    return "CAPABILITY_BROWSE";
  }

  if (tier === "PARTIAL") {
    if (productCount > 0 || capabilityProfileCount > 0) {
      return "HYBRID";
    }
    return "CAPABILITY_BROWSE";
  }

  // READY — catalog-first; fall back to browse when no live rows
  if (productCount > 0) {
    return "LIVE_PRODUCTS";
  }

  return "CAPABILITY_BROWSE";
}
