import type { SupplierProductResult } from "../types";
import { partitionDiscoveryResults } from "./partitionDiscoveryResults";
import { isCapabilityProfileResult } from "./profileResultContract";

export const CAPABILITY_PROFILE_BADGE = "Likely carries";
export const CAPABILITY_PROFILE_DISCLAIMER =
  "Based on supplier capability data, not live inventory.";
export const CAPABILITY_PROFILE_CTA_EVIDENCE = "View supplier evidence";
export const CAPABILITY_PROFILE_CTA_CONTACT = "Contact supplier";

export type CapabilityProfileCardDisplay = {
  badge: string;
  disclaimer: string;
  ctaLabel: string;
  ctaHref: string | null;
  ctaExternal: boolean;
  showPrice: false;
};

export function getCapabilityProfileCardDisplay(
  result: SupplierProductResult,
  telHref?: string | null
): CapabilityProfileCardDisplay {
  const evidenceUrl = result.productUrl?.trim() || null;
  const hasEvidence = Boolean(evidenceUrl);

  return {
    badge: CAPABILITY_PROFILE_BADGE,
    disclaimer: CAPABILITY_PROFILE_DISCLAIMER,
    ctaLabel: hasEvidence
      ? CAPABILITY_PROFILE_CTA_EVIDENCE
      : CAPABILITY_PROFILE_CTA_CONTACT,
    ctaHref: hasEvidence ? evidenceUrl : null,
    ctaExternal: hasEvidence,
    showPrice: false,
  };
}

export type SupplierProductSearchResultKind = "live" | "capability_profile";

export type SupplierProductSearchResultSummary = {
  live: number;
  capabilityProfile: number;
};

/** Additive API envelope — does not change {@link SupplierProductResult} fields. */
export function enrichSupplierProductSearchResponse(
  results: SupplierProductResult[]
): {
  results: Array<SupplierProductResult & { resultKind: SupplierProductSearchResultKind }>;
  resultSummary: SupplierProductSearchResultSummary;
} {
  const { liveProducts, capabilityProfiles } = partitionDiscoveryResults(results);

  return {
    results: results.map((row) => ({
      ...row,
      resultKind: isCapabilityProfileResult(row)
        ? "capability_profile"
        : "live",
    })),
    resultSummary: {
      live: liveProducts.length,
      capabilityProfile: capabilityProfiles.length,
    },
  };
}
