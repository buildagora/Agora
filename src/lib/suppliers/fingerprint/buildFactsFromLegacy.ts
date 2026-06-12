import type { SupplierPlatform } from "@prisma/client";
import {
  getDomainPlatformConfig,
  SUPPLIER_DOMAIN_PLATFORM_CONFIG,
} from "../supplierDomainPlatformConfig";
import type { DomainPlatformConfig } from "../supplierPlatformTypes";
import {
  getSupplierSiteSearchConfig,
  resolveSupplierAdapterPrefix,
  type SupplierSearchMode,
  type SupplierSiteSearchConfig,
} from "../supplierSiteSearchConfig";
import { resolveDemandPriority } from "./aggregateDemand";
import { normalizeCanonicalDomain } from "./normalizeCanonicalDomain";
import { resolvePlatformAccess } from "./resolvePlatformAccess";
import type {
  BuildFactsFromLegacyInput,
  LegacyStrategySnapshot,
  SupplierFingerprintFacts,
} from "./types";
import type { PlatformAccessResolution } from "./types";

const UNPROBED_FACTS = {
  hasSchemaMarkup: null as boolean | null,
  hasSitemap: null as boolean | null,
  sitemapUrls: null as unknown | null,
  renderingType: "UNKNOWN" as const,
  isSPA: null as boolean | null,
  antiBotRisk: "UNKNOWN" as const,
  hasPublicApi: null as boolean | null,
  publicApiAccessStatus: "NOT_PROBED" as const,
  publicApiEndpoint: null as string | null,
  platformBindingId: null as string | null,
  notes: null as string | null,
};

type PlatformConfigShape = Pick<
  SupplierSiteSearchConfig | DomainPlatformConfig,
  "mode" | "algolia" | "shopify"
>;

function resolvePublicApiFactFields(
  platformAccessStatus: PlatformAccessResolution["platformAccessStatus"],
  config: PlatformConfigShape
): Pick<
  SupplierFingerprintFacts,
  "hasPublicApi" | "publicApiAccessStatus" | "publicApiEndpoint"
> {
  if (platformAccessStatus !== "PUBLIC_ANONYMOUS") {
    return {
      hasPublicApi: UNPROBED_FACTS.hasPublicApi,
      publicApiAccessStatus: UNPROBED_FACTS.publicApiAccessStatus,
      publicApiEndpoint: UNPROBED_FACTS.publicApiEndpoint,
    };
  }

  if (config.mode === "algolia" && config.algolia?.searchApiKey?.trim()) {
    const appId = config.algolia.appId?.trim();
    const indexName = config.algolia.indexName?.trim();
    return {
      hasPublicApi: true,
      publicApiAccessStatus: "ACCESSIBLE",
      publicApiEndpoint:
        appId && indexName
          ? `https://${appId}-dsn.algolia.net/1/indexes/${encodeURIComponent(indexName)}/query`
          : null,
    };
  }

  if (config.mode === "shopify" && config.shopify) {
    const origin = config.shopify.siteOrigin.replace(/\/$/, "");
    const path = config.shopify.suggestPath ?? "/search/suggest.json";
    return {
      hasPublicApi: true,
      publicApiAccessStatus: "ACCESSIBLE",
      publicApiEndpoint: `${origin}${path.startsWith("/") ? path : `/${path}`}`,
    };
  }

  return {
    hasPublicApi: UNPROBED_FACTS.hasPublicApi,
    publicApiAccessStatus: UNPROBED_FACTS.publicApiAccessStatus,
    publicApiEndpoint: UNPROBED_FACTS.publicApiEndpoint,
  };
}

function modeToPlatform(mode: SupplierSearchMode | DomainPlatformConfig["mode"]): SupplierPlatform {
  switch (mode) {
    case "constructor":
      return "CONSTRUCTOR";
    case "bloomreach":
      return "BLOOMREACH";
    case "sli":
      return "SLI";
    case "coveo":
      return "COVEO";
    case "algolia":
      return "ALGOLIA";
    case "shopify":
      return "SHOPIFY";
    case "hybris":
      return "HYBRIS";
    default:
      return "UNKNOWN";
  }
}

function snapshotFromRegistry(
  prefix: string,
  config: SupplierSiteSearchConfig,
  listingPath?: string | null
): LegacyStrategySnapshot {
  const matchKind =
    config.mode === "product_engine"
      ? "product_engine"
      : config.mode === "site_organic"
        ? "site_organic"
        : "registry_prefix";

  return {
    matchKind,
    prefix,
    mode: config.mode,
    domain: config.domain,
    source: config.source,
    listingPath: listingPath ?? null,
  };
}

function snapshotFromDomain(
  domain: string,
  config: DomainPlatformConfig,
  listingPath?: string | null
): LegacyStrategySnapshot {
  return {
    matchKind: "domain_platform",
    mode: config.mode,
    domain,
    source: config.source,
    listingPath: listingPath ?? null,
  };
}

function buildFromSiteSearchConfig(
  input: BuildFactsFromLegacyInput,
  prefix: string,
  config: SupplierSiteSearchConfig
): SupplierFingerprintFacts {
  const envKeyPresence = input.envKeyPresence ?? {};
  const asOf = input.asOf ?? new Date();
  const canonicalDomain =
    normalizeCanonicalDomain(input.supplier.domain) ?? config.domain;
  const legacySnapshot = snapshotFromRegistry(
    prefix,
    config,
    input.audit?.listingPath
  );

  if (config.mode === "product_engine") {
    const demand = resolveDemandPriority(input.demandScore);
    return {
      supplierId: input.supplier.id,
      canonicalDomain,
      detectedPlatform: "UNKNOWN",
      platformDetectionConfidence: 1,
      platformDetectionSource: "legacy_config",
      platformAccessStatus: "NOT_APPLICABLE",
      platformBindingValid: false,
      ...UNPROBED_FACTS,
      demandPriority: demand.demandPriority,
      demandScore: demand.demandScore,
      allowSerpFallback: true,
      fingerprintStatus: "SUCCESS",
      lastFingerprintedAt: asOf,
      legacySnapshot,
    };
  }

  if (config.mode === "site_organic") {
    const demand = resolveDemandPriority(input.demandScore);
    return {
      supplierId: input.supplier.id,
      canonicalDomain,
      detectedPlatform: "UNKNOWN",
      platformDetectionConfidence: 1,
      platformDetectionSource: "legacy_config",
      platformAccessStatus: "NOT_APPLICABLE",
      platformBindingValid: false,
      ...UNPROBED_FACTS,
      demandPriority: demand.demandPriority,
      demandScore: demand.demandScore,
      allowSerpFallback: true,
      fingerprintStatus: "SUCCESS",
      lastFingerprintedAt: asOf,
      legacySnapshot,
    };
  }

  const detectedPlatform = modeToPlatform(config.mode);
  const access = resolvePlatformAccess({
    platform: detectedPlatform,
    legacyMode: config.mode,
    constructorConfig: config.constructorPlatform,
    bloomreachConfig: config.bloomreach,
    coveoConfig: config.coveo,
    algoliaConfig: config.algolia,
    hybrisConfig: config.hybris,
    envKeyPresence,
  });
  const demand = resolveDemandPriority(input.demandScore);
  const publicApiFacts = resolvePublicApiFactFields(
    access.platformAccessStatus,
    config
  );

  return {
    supplierId: input.supplier.id,
    canonicalDomain,
    detectedPlatform,
    platformDetectionConfidence: 1,
    platformDetectionSource: "legacy_config",
    platformAccessStatus: access.platformAccessStatus,
    platformBindingValid: access.platformBindingValid,
    ...UNPROBED_FACTS,
    ...publicApiFacts,
    demandPriority: demand.demandPriority,
    demandScore: demand.demandScore,
    allowSerpFallback: false,
    fingerprintStatus: "SUCCESS",
    lastFingerprintedAt: asOf,
    legacySnapshot,
  };
}

function buildFromDomainPlatform(
  input: BuildFactsFromLegacyInput,
  canonicalDomain: string,
  config: DomainPlatformConfig
): SupplierFingerprintFacts {
  const envKeyPresence = input.envKeyPresence ?? {};
  const asOf = input.asOf ?? new Date();
  const detectedPlatform = modeToPlatform(config.mode);
  const access = resolvePlatformAccess({
    platform: detectedPlatform,
    legacyMode: config.mode,
    bloomreachConfig: config.bloomreach,
    coveoConfig: config.coveo,
    algoliaConfig: config.algolia,
    hybrisConfig: config.hybris,
    envKeyPresence,
  });
  const demand = resolveDemandPriority(input.demandScore);
  const publicApiFacts = resolvePublicApiFactFields(
    access.platformAccessStatus,
    config
  );

  return {
    supplierId: input.supplier.id,
    canonicalDomain,
    detectedPlatform,
    platformDetectionConfidence: 1,
    platformDetectionSource: "legacy_config",
    platformAccessStatus: access.platformAccessStatus,
    platformBindingValid: access.platformBindingValid,
    ...UNPROBED_FACTS,
    ...publicApiFacts,
    demandPriority: demand.demandPriority,
    demandScore: demand.demandScore,
    allowSerpFallback: false,
    fingerprintStatus: "SUCCESS",
    lastFingerprintedAt: asOf,
    legacySnapshot: snapshotFromDomain(
      canonicalDomain,
      config,
      input.audit?.listingPath
    ),
  };
}

function buildCapabilityOrNoListing(
  input: BuildFactsFromLegacyInput,
  matchKind: "capability_only" | "no_listing"
): SupplierFingerprintFacts {
  const asOf = input.asOf ?? new Date();
  const demand = resolveDemandPriority(input.demandScore);

  return {
    supplierId: input.supplier.id,
    canonicalDomain: normalizeCanonicalDomain(input.supplier.domain),
    detectedPlatform: "UNKNOWN",
    platformDetectionConfidence: null,
    platformDetectionSource: input.audit?.listingPath ? "audit_inventory" : null,
    platformAccessStatus: "NOT_APPLICABLE",
    platformBindingValid: false,
    ...UNPROBED_FACTS,
    demandPriority: demand.demandPriority,
    demandScore: demand.demandScore,
    allowSerpFallback: false,
    fingerprintStatus: "SUCCESS",
    lastFingerprintedAt: asOf,
    legacySnapshot: {
      matchKind,
      listingPath: input.audit?.listingPath ?? null,
    },
  };
}

function buildGenericDomain(
  input: BuildFactsFromLegacyInput,
  canonicalDomain: string
): SupplierFingerprintFacts {
  const asOf = input.asOf ?? new Date();
  const demand = resolveDemandPriority(input.demandScore);

  return {
    supplierId: input.supplier.id,
    canonicalDomain,
    detectedPlatform: "UNKNOWN",
    platformDetectionConfidence: null,
    platformDetectionSource: input.audit?.listingPath ? "audit_inventory" : null,
    platformAccessStatus: "NOT_APPLICABLE",
    platformBindingValid: false,
    ...UNPROBED_FACTS,
    demandPriority: demand.demandPriority,
    demandScore: demand.demandScore,
    allowSerpFallback: true,
    fingerprintStatus: "SUCCESS",
    lastFingerprintedAt: asOf,
    legacySnapshot: {
      matchKind: "generic_domain",
      domain: canonicalDomain,
      listingPath: input.audit?.listingPath ?? null,
    },
  };
}

/**
 * Build SupplierFingerprint fact fields from legacy TS config (no DB writes, no network).
 */
export function buildFactsFromLegacy(
  input: BuildFactsFromLegacyInput
): SupplierFingerprintFacts {
  const prefix = resolveSupplierAdapterPrefix(input.supplier.id);
  const registryConfig = prefix
    ? getSupplierSiteSearchConfig(input.supplier.id)
    : null;

  if (registryConfig && prefix) {
    return buildFromSiteSearchConfig(input, prefix, registryConfig);
  }

  if (input.audit?.capabilityOnly || input.audit?.noListing) {
    const matchKind = input.audit.noListing ? "no_listing" : "capability_only";
    return buildCapabilityOrNoListing(input, matchKind);
  }

  const canonicalDomain = normalizeCanonicalDomain(input.supplier.domain);
  const domainConfig = canonicalDomain
    ? getDomainPlatformConfig(canonicalDomain)
    : null;

  if (domainConfig && canonicalDomain) {
    return buildFromDomainPlatform(input, canonicalDomain, domainConfig);
  }

  if (!canonicalDomain) {
    return buildCapabilityOrNoListing(input, "capability_only");
  }

  return buildGenericDomain(input, canonicalDomain);
}

/** Exposed for tests: known domain-platform keys without importing side effects elsewhere. */
export const DOMAIN_PLATFORM_KEYS = Object.keys(SUPPLIER_DOMAIN_PLATFORM_CONFIG);
