import type { AntiBotRisk, ExtractionStrategy } from "@prisma/client";
import type {
  AntiBotCategory,
  BlockedUrlClass,
} from "../fingerprint/classifyAntiBotResponse";
import type {
  EnvKeyPresence,
  LegacyStrategySnapshot,
  SupplierFingerprintFacts,
} from "../fingerprint/types";

export type { ExtractionStrategy };

export type RouterPurpose = "shadow" | "production" | "test";

export type ResolveExtractionStrategyOptions = {
  allowPlaywright?: boolean;
  purpose?: RouterPurpose;
};

export type ResolveExtractionStrategyInput = {
  supplierId: string;
  canonicalDomain?: string | null;
  facts: SupplierFingerprintFacts;
  legacySnapshot?: LegacyStrategySnapshot;
  envKeyPresence?: EnvKeyPresence;
  options?: ResolveExtractionStrategyOptions;
};

export type StrategyTier = 1 | 2 | 3 | 4 | 5;

export type StrategyViability = {
  strategy: ExtractionStrategy;
  viable: boolean;
  reason: string;
  confidence?: number;
  tier: StrategyTier;
};

export type StrategyPlan = {
  primaryStrategy: ExtractionStrategy;
  fallbackChain: ExtractionStrategy[];
  fullOrderedChain: ExtractionStrategy[];
  viabilityByStrategy: StrategyViability[];
  strategyReason: string;
  strategyConfidence: number;
  directExtractionViable: boolean;
  tier: StrategyTier;
  decisionTrace: string[];
};

export type StrategyResolution = StrategyPlan & {
  /** @deprecated Use primaryStrategy */
  chosenStrategy: ExtractionStrategy;
  /** @deprecated Use fallbackChain[0] */
  fallbackStrategy?: ExtractionStrategy;
};

/** Per-strategy attempt record for chain execution telemetry. */
export type StrategyExecutionAttempt = {
  strategy: ExtractionStrategy;
  status: "success" | "empty" | "unsupported" | "error" | "timeout" | "skipped";
  reason?: string;
  resultCount?: number;
  latencyMs?: number;
  /** Populated when PROBABILISTIC_CATEGORY_PROFILE executes. */
  capabilityMatchCount?: number;
  capabilityScoreMin?: number;
  capabilityScoreMax?: number;
  /** Populated when SCHEMA_OR_SITEMAP executes. */
  candidateUrlsExamined?: number;
  productPagesFetched?: number;
  productPagesBlocked?: number;
  discoveryUrlCacheHit?: boolean;
  discoveryUrlCount?: number;
  sitemapFetchCount?: number;
  sitemapParseLatencyMs?: number;
  sitemapDecompressLatencyMs?: number;
  urlRankingLatencyMs?: number;
  pageBytesFetched?: number;
  averagePageFetchMs?: number;
  metadataCacheHit?: number;
  metadataCacheMiss?: number;
  metadataExtractionLatencyMs?: number;
  pageFetchFromCache?: number;
  earlyExitAfterPages?: number;
  /** Populated when HTML_SCRAPE executes. */
  pagesFetched?: number;
  pagesBlocked?: number;
  extractionSuccessCount?: number;
  discoverySource?: "serp" | "homepage" | "mixed";
  serpOrganicCount?: number;
  topUrlScore?: number;
  aliasSourceProductType?: string;
  aliasMatchType?: "direct_lexical" | "path_alias" | "title_alias" | "subcategory_expansion";
  subcategoryUrlsDiscovered?: number;
  /** Populated when HTML_SCRAPE or SCHEMA fetch hits anti-bot signals. */
  antiBotRisk?: AntiBotRisk;
  antiBotCategory?: AntiBotCategory;
  blockedUrlClass?: BlockedUrlClass;
};

export type LegacyStrategyResolution = {
  strategy: ExtractionStrategy;
  reason: string;
  legacyMode?: string;
  matchKind?: LegacyStrategySnapshot["matchKind"];
};

export type ShadowMatchStatus =
  | "EXACT_MATCH"
  | "SAME_TIER"
  | "EXPECTED_FUTURE"
  | "INVESTIGATE"
  | "LEGACY_SNAPSHOT_DRIFT";

export type ShadowMismatchType =
  | "NONE"
  | "PLATFORM_ACCESS_BLOCKED"
  | "DIRECT_OUTRANKS_SERP"
  | "PROFILE_INSTEAD_OF_SERP"
  | "TIER_DRIFT"
  | "UNEXPECTED";

export type ShadowSeverity = "none" | "low" | "medium" | "high";

export type ShadowComparisonResult = {
  matchStatus: ShadowMatchStatus;
  mismatchType: ShadowMismatchType;
  severity: ShadowSeverity;
  explanation: string;
  legacyStrategy: ExtractionStrategy;
  routerStrategy: ExtractionStrategy;
  legacyTier: StrategyTier;
  routerTier: StrategyTier;
};

export const EXTRACTION_STRATEGY_TIER: Record<ExtractionStrategy, StrategyTier> = {
  PLATFORM_API: 1,
  PUBLIC_API: 1,
  SCHEMA_OR_SITEMAP: 2,
  HTML_SCRAPE: 2,
  PLAYWRIGHT: 3,
  ANTI_BOT_EVALUATION: 3,
  SERP_PRODUCT_ENGINE: 4,
  SERP_SITE_ORGANIC: 4,
  PROBABILISTIC_CATEGORY_PROFILE: 5,
  NONE: 5,
};

export const TIER_1_STRATEGIES: ExtractionStrategy[] = ["PLATFORM_API", "PUBLIC_API"];
export const TIER_4_SERP_STRATEGIES: ExtractionStrategy[] = [
  "SERP_PRODUCT_ENGINE",
  "SERP_SITE_ORGANIC",
];

export function strategyTier(strategy: ExtractionStrategy): StrategyTier {
  return EXTRACTION_STRATEGY_TIER[strategy];
}

export function isDirectExtractionStrategy(strategy: ExtractionStrategy): boolean {
  const tier = strategyTier(strategy);
  return tier === 1 || tier === 2;
}
