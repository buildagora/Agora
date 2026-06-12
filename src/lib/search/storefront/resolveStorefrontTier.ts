import readinessMap from "./data/storefrontReadiness.json";
import type {
  StorefrontDiscoveryStatus,
  StorefrontTier,
} from "./types";

const REGISTRY = readinessMap as Record<string, StorefrontTier>;

/** Lookup Phase 10.2 readiness tier; unknown suppliers default to CAPABILITY. */
export function lookupStorefrontTier(supplierId: string): StorefrontTier {
  return REGISTRY[supplierId] ?? "CAPABILITY";
}

export function isCapabilityTier(tier: StorefrontTier): boolean {
  return tier === "CAPABILITY";
}

export function resolveStorefrontDiscoveryStatus(
  tier: StorefrontTier,
  productCount: number
): StorefrontDiscoveryStatus {
  if (tier === "READY") return "CATALOG_AVAILABLE";
  if (tier === "PARTIAL") {
    return productCount > 0 ? "LIMITED_CATALOG" : "CAPABILITY_PROFILE";
  }
  return "CAPABILITY_PROFILE";
}

export function discoveryStatusLabel(status: StorefrontDiscoveryStatus): string {
  switch (status) {
    case "CATALOG_AVAILABLE":
      return "Catalog available";
    case "LIMITED_CATALOG":
      return "Limited catalog";
    case "CAPABILITY_PROFILE":
      return "Capability profile";
  }
}
