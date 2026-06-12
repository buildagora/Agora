import type { ExtractionStrategy, PlatformAccessStatus } from "@prisma/client";
import type { SupplierFingerprintFacts } from "../fingerprint/types";
import {
  TIER_1_STRATEGIES,
  TIER_4_SERP_STRATEGIES,
  type ShadowComparisonResult,
  type ShadowMismatchType,
  type StrategyResolution,
  strategyTier,
} from "./types";
import type { LegacyStrategyResolution } from "./types";

const BLOCKED_PLATFORM_ACCESS: PlatformAccessStatus[] = [
  "BINDING_INCOMPLETE",
  "REQUIRES_AUTH",
  "BLOCKED",
];

function isPlatformFamily(strategy: ExtractionStrategy): boolean {
  return TIER_1_STRATEGIES.includes(strategy);
}

function isSerpFamily(strategy: ExtractionStrategy): boolean {
  return TIER_4_SERP_STRATEGIES.includes(strategy);
}

function classifyExpectedFuture(
  legacyStrategy: ExtractionStrategy,
  routerStrategy: ExtractionStrategy,
  facts?: Pick<
    SupplierFingerprintFacts,
    "platformAccessStatus" | "allowSerpFallback" | "legacySnapshot"
  >
): string | null {
  if (!facts) return null;

  if (
    isPlatformFamily(legacyStrategy) &&
    !isPlatformFamily(routerStrategy) &&
    BLOCKED_PLATFORM_ACCESS.includes(facts.platformAccessStatus)
  ) {
    return "legacy_platform_label_blocked_by_access_facts";
  }

  if (
    isSerpFamily(legacyStrategy) &&
    strategyTier(routerStrategy) < 4
  ) {
    return "router_direct_extraction_outranks_legacy_serp";
  }

  if (
    legacyStrategy === "SERP_SITE_ORGANIC" &&
    routerStrategy === "PROBABILISTIC_CATEGORY_PROFILE" &&
    facts.allowSerpFallback === false
  ) {
    return "router_profile_no_serp_fallback";
  }

  return null;
}

function detectSnapshotDrift(
  legacy: LegacyStrategyResolution,
  facts?: Pick<SupplierFingerprintFacts, "legacySnapshot">
): boolean {
  if (!facts?.legacySnapshot?.mode || !legacy.legacyMode) return false;
  return facts.legacySnapshot.mode !== legacy.legacyMode;
}

export type ShadowCompareInput = {
  legacy: LegacyStrategyResolution;
  router: StrategyResolution;
  facts?: Pick<
    SupplierFingerprintFacts,
    | "platformAccessStatus"
    | "allowSerpFallback"
    | "legacySnapshot"
    | "supplierId"
  >;
};

/**
 * Compare legacy vs router strategies for Phase 0 shadow reporting.
 */
export function shadowCompare(input: ShadowCompareInput): ShadowComparisonResult {
  const legacyStrategy = input.legacy.strategy;
  const routerStrategy = input.router.chosenStrategy;
  const legacyTier = strategyTier(legacyStrategy);
  const routerTier = strategyTier(routerStrategy);

  if (detectSnapshotDrift(input.legacy, input.facts)) {
    return {
      matchStatus: "LEGACY_SNAPSHOT_DRIFT",
      mismatchType: "TIER_DRIFT",
      severity: "medium",
      explanation:
        "Legacy resolver mode disagrees with fingerprint legacySnapshot.mode.",
      legacyStrategy,
      routerStrategy,
      legacyTier,
      routerTier,
    };
  }

  if (legacyStrategy === routerStrategy) {
    return {
      matchStatus: "EXACT_MATCH",
      mismatchType: "NONE",
      severity: "none",
      explanation: "Legacy and router strategies match.",
      legacyStrategy,
      routerStrategy,
      legacyTier,
      routerTier,
    };
  }

  const expectedReason = classifyExpectedFuture(
    legacyStrategy,
    routerStrategy,
    input.facts
  );
  if (expectedReason) {
    let mismatchType: ShadowMismatchType = "UNEXPECTED";
    if (expectedReason.includes("blocked_by_access")) {
      mismatchType = "PLATFORM_ACCESS_BLOCKED";
    } else if (expectedReason.includes("outranks_legacy_serp")) {
      mismatchType = "DIRECT_OUTRANKS_SERP";
    } else if (expectedReason.includes("no_serp_fallback")) {
      mismatchType = "PROFILE_INSTEAD_OF_SERP";
    }

    return {
      matchStatus: "EXPECTED_FUTURE",
      mismatchType,
      severity: "low",
      explanation: expectedReason,
      legacyStrategy,
      routerStrategy,
      legacyTier,
      routerTier,
    };
  }

  if (legacyTier === routerTier) {
    return {
      matchStatus: "SAME_TIER",
      mismatchType: "TIER_DRIFT",
      severity: "low",
      explanation: `Same tier ${legacyTier} but different strategies: ${legacyStrategy} vs ${routerStrategy}.`,
      legacyStrategy,
      routerStrategy,
      legacyTier,
      routerTier,
    };
  }

  return {
    matchStatus: "INVESTIGATE",
    mismatchType: "UNEXPECTED",
    severity: "high",
    explanation: `Unexpected mismatch: legacy ${legacyStrategy} (tier ${legacyTier}) vs router ${routerStrategy} (tier ${routerTier}).`,
    legacyStrategy,
    routerStrategy,
    legacyTier,
    routerTier,
  };
}
