import type { ExtractionStrategy } from "@prisma/client";
import { normalizeCanonicalDomain } from "../fingerprint/normalizeCanonicalDomain";
import type { LegacyStrategySnapshot } from "../fingerprint/types";
import { getDomainPlatformConfig } from "../supplierDomainPlatformConfig";
import {
  getSupplierSiteSearchConfig,
  resolveSupplierAdapterPrefix,
  type SupplierSearchMode,
} from "../supplierSiteSearchConfig";
import type { LegacyStrategyResolution } from "./types";

const PLATFORM_MODES = new Set<SupplierSearchMode>([
  "constructor",
  "bloomreach",
  "sli",
  "coveo",
  "algolia",
  "shopify",
  "hybris",
]);

export type ResolveLegacyStrategyInput = {
  supplierId: string;
  canonicalDomain?: string | null;
  /** When provided, mode/matchKind drive the label (shadow / backfill parity). */
  legacySnapshot?: LegacyStrategySnapshot;
};

function modeToLegacyStrategy(
  mode: string,
  domain: string | null
): ExtractionStrategy {
  if (mode === "product_engine") return "SERP_PRODUCT_ENGINE";
  if (mode === "site_organic") return "SERP_SITE_ORGANIC";

  if (mode === "shopify") return "PUBLIC_API";

  if (mode === "algolia") {
    const domainConfig = domain ? getDomainPlatformConfig(domain) : null;
    if (domainConfig?.algolia?.searchApiKey?.trim()) {
      return "PUBLIC_API";
    }
    return "PLATFORM_API";
  }

  if (PLATFORM_MODES.has(mode as SupplierSearchMode)) {
    return "PLATFORM_API";
  }

  return "SERP_SITE_ORGANIC";
}

function resolveFromSnapshot(
  snapshot: LegacyStrategySnapshot,
  domain: string | null
): LegacyStrategyResolution {
  if (
    snapshot.matchKind === "capability_only" ||
    snapshot.matchKind === "no_listing"
  ) {
    return {
      strategy: "PROBABILISTIC_CATEGORY_PROFILE",
      reason: "legacy_capability_or_no_listing",
      matchKind: snapshot.matchKind,
    };
  }

  if (snapshot.matchKind === "generic_domain") {
    return {
      strategy: "SERP_SITE_ORGANIC",
      reason: "legacy_generic_domain_serp",
      matchKind: snapshot.matchKind,
      legacyMode: snapshot.mode,
    };
  }

  if (snapshot.mode) {
    return {
      strategy: modeToLegacyStrategy(snapshot.mode, domain),
      reason: "legacy_snapshot_mode",
      legacyMode: snapshot.mode,
      matchKind: snapshot.matchKind,
    };
  }

  return {
    strategy: domain ? "SERP_SITE_ORGANIC" : "PROBABILISTIC_CATEGORY_PROFILE",
    reason: "legacy_snapshot_incomplete",
    matchKind: snapshot.matchKind,
  };
}

/**
 * Mirror today's legacy routing label for shadow comparison only (no production side effects).
 */
export function resolveLegacyStrategy(
  input: ResolveLegacyStrategyInput
): LegacyStrategyResolution {
  const domain =
    normalizeCanonicalDomain(input.canonicalDomain) ??
    (input.legacySnapshot?.domain
      ? normalizeCanonicalDomain(input.legacySnapshot.domain)
      : null);

  if (input.legacySnapshot) {
    return resolveFromSnapshot(input.legacySnapshot, domain);
  }

  const prefix = resolveSupplierAdapterPrefix(input.supplierId);
  const registryConfig = prefix
    ? getSupplierSiteSearchConfig(input.supplierId)
    : null;

  if (registryConfig) {
    return {
      strategy: modeToLegacyStrategy(registryConfig.mode, domain ?? registryConfig.domain),
      reason: "legacy_registry_config",
      legacyMode: registryConfig.mode,
      matchKind:
        registryConfig.mode === "product_engine"
          ? "product_engine"
          : registryConfig.mode === "site_organic"
            ? "site_organic"
            : "registry_prefix",
    };
  }

  const domainConfig = domain ? getDomainPlatformConfig(domain) : null;
  if (domainConfig) {
    return {
      strategy: modeToLegacyStrategy(domainConfig.mode, domain),
      reason: "legacy_domain_platform_config",
      legacyMode: domainConfig.mode,
      matchKind: "domain_platform",
    };
  }

  if (!domain) {
    return {
      strategy: "PROBABILISTIC_CATEGORY_PROFILE",
      reason: "legacy_no_domain",
    };
  }

  return {
    strategy: "SERP_SITE_ORGANIC",
    reason: "legacy_generic_domain",
    matchKind: "generic_domain",
    legacyMode: undefined,
  };
}
