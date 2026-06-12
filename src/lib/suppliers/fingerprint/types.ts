import type {
  AntiBotRisk,
  DemandPriority,
  ExtractionStrategy,
  FingerprintStatus,
  PlatformAccessStatus,
  PublicApiAccessStatus,
  RenderingType,
  SupplierPlatform,
} from "@prisma/client";

export type {
  AntiBotRisk,
  DemandPriority,
  ExtractionStrategy,
  FingerprintStatus,
  PlatformAccessStatus,
  PublicApiAccessStatus,
  RenderingType,
  SupplierPlatform,
};

/** Env var names mapped to whether they are set (tests pass a stub; no process.env reads). */
export type EnvKeyPresence = Record<string, boolean | undefined>;

export type LegacyStrategySnapshot = {
  matchKind:
    | "registry_prefix"
    | "domain_platform"
    | "product_engine"
    | "site_organic"
    | "generic_domain"
    | "capability_only"
    | "no_listing";
  prefix?: string;
  mode?: string;
  domain?: string;
  source?: string;
  listingPath?: string | null;
};

export type PlatformAccessResolution = {
  platformAccessStatus: PlatformAccessStatus;
  platformBindingValid: boolean;
  /** Env keys evaluated when resolving access (audit trail). */
  evaluatedEnvKeys: string[];
};

export type DemandResolution = {
  demandPriority: DemandPriority;
  demandScore: number | null;
};

/**
 * Fact fields aligned with SupplierFingerprint (Option B — no chosenStrategy).
 */
export type SupplierFingerprintFacts = {
  supplierId: string;
  canonicalDomain: string | null;
  detectedPlatform: SupplierPlatform;
  platformDetectionConfidence: number | null;
  platformDetectionSource: string | null;
  platformAccessStatus: PlatformAccessStatus;
  platformBindingId: string | null;
  platformBindingValid: boolean;
  hasPublicApi: boolean | null;
  publicApiAccessStatus: PublicApiAccessStatus;
  publicApiEndpoint: string | null;
  hasSchemaMarkup: boolean | null;
  hasSitemap: boolean | null;
  sitemapUrls: unknown | null;
  renderingType: RenderingType;
  isSPA: boolean | null;
  antiBotRisk: AntiBotRisk;
  demandPriority: DemandPriority;
  demandScore: number | null;
  allowSerpFallback: boolean;
  fingerprintStatus: FingerprintStatus;
  lastFingerprintedAt: Date | null;
  legacySnapshot: LegacyStrategySnapshot;
  notes: string | null;
};

export type SupplierLike = {
  id: string;
  domain?: string | null;
};

export type BuildFactsFromLegacyInput = {
  supplier: SupplierLike;
  envKeyPresence?: EnvKeyPresence;
  demandScore?: number | null;
  audit?: {
    listingPath?: string | null;
    capabilityOnly?: boolean;
    noListing?: boolean;
  };
  asOf?: Date;
};

/** Initial Phase 3A probe cohort — not run for all suppliers unless explicitly requested. */
export const FINGERPRINT_PROBE_COHORT_PREFIXES = [
  "abc_supply",
  "lansing",
  "gulfeagle",
] as const;

export function isFingerprintProbeCohortSupplier(supplierId: string): boolean {
  return FINGERPRINT_PROBE_COHORT_PREFIXES.some((prefix) =>
    supplierId.startsWith(prefix)
  );
}

export function shouldRunFingerprintProbe(input: {
  probeEnabled: boolean;
  supplierId: string;
  explicitSupplierId?: string;
}): boolean {
  if (!input.probeEnabled) return false;
  if (input.explicitSupplierId) {
    return input.supplierId === input.explicitSupplierId;
  }
  return isFingerprintProbeCohortSupplier(input.supplierId);
}

export type SchemaSitemapProbeFacts = Pick<
  SupplierFingerprintFacts,
  "hasSchemaMarkup" | "hasSitemap" | "sitemapUrls"
>;

export type RenderingProbeFacts = Pick<
  SupplierFingerprintFacts,
  "renderingType" | "isSPA" | "antiBotRisk"
>;

export type FingerprintLiveProbeFacts = SchemaSitemapProbeFacts &
  RenderingProbeFacts;

export function mergeLiveProbeFacts(
  facts: SupplierFingerprintFacts,
  probe: FingerprintLiveProbeFacts
): SupplierFingerprintFacts {
  return {
    ...facts,
    hasSchemaMarkup: probe.hasSchemaMarkup,
    hasSitemap: probe.hasSitemap,
    sitemapUrls: probe.sitemapUrls,
    renderingType: probe.renderingType,
    isSPA: probe.isSPA,
    antiBotRisk: probe.antiBotRisk,
  };
}
