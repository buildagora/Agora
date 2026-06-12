import { buildFactsFromLegacy } from "../../fingerprint/buildFactsFromLegacy";
import { resolveExtractionStrategy } from "../resolveExtractionStrategy";
import { resolveLegacyStrategy } from "../resolveLegacyStrategy";
import { shadowCompare } from "../shadowCompare";
import type { ExtractionStrategy, StrategyResolution } from "../types";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
  console.log(`PASS: ${message}`);
}

function stubRouterResolution(
  chosenStrategy: ExtractionStrategy,
  partial: Partial<StrategyResolution> = {}
): StrategyResolution {
  const primaryStrategy = partial.primaryStrategy ?? chosenStrategy;
  const fallbackChain =
    partial.fallbackChain ??
    (primaryStrategy === "PROBABILISTIC_CATEGORY_PROFILE"
      ? []
      : ["PROBABILISTIC_CATEGORY_PROFILE" as ExtractionStrategy]);
  return {
    primaryStrategy,
    fallbackChain,
    fullOrderedChain: [primaryStrategy, ...fallbackChain],
    viabilityByStrategy: [],
    strategyConfidence: 0.7,
    strategyReason: "test",
    directExtractionViable: false,
    tier: 4,
    decisionTrace: [],
    chosenStrategy: primaryStrategy,
    fallbackStrategy: fallbackChain[0],
    ...partial,
  };
}

console.log("\nshadowCompare tests\n");

const exact = shadowCompare({
  legacy: { strategy: "SERP_SITE_ORGANIC", reason: "test" },
  router: stubRouterResolution("SERP_SITE_ORGANIC", {
    strategyConfidence: 0.7,
    directExtractionViable: false,
    tier: 4,
  }),
});
assert(exact.matchStatus === "EXACT_MATCH", "exact match");

const sameTier = shadowCompare({
  legacy: { strategy: "PLATFORM_API", reason: "test" },
  router: stubRouterResolution("PUBLIC_API", {
    strategyConfidence: 0.9,
    directExtractionViable: true,
    tier: 1,
  }),
});
assert(sameTier.matchStatus === "SAME_TIER", "same tier different strategy");

const bakerFacts = buildFactsFromLegacy({
  supplier: { id: "baker_shadow", domain: "bakerdist.com" },
  envKeyPresence: {},
});
const bakerLegacy = resolveLegacyStrategy({
  supplierId: bakerFacts.supplierId,
  canonicalDomain: bakerFacts.canonicalDomain,
  legacySnapshot: bakerFacts.legacySnapshot,
});
const bakerRouter = resolveExtractionStrategy({
  supplierId: bakerFacts.supplierId,
  facts: bakerFacts,
});
const bakerShadow = shadowCompare({
  legacy: bakerLegacy,
  router: bakerRouter,
  facts: bakerFacts,
});
assert(
  bakerShadow.matchStatus === "EXPECTED_FUTURE" &&
    bakerShadow.mismatchType === "PLATFORM_ACCESS_BLOCKED",
  "expected future: legacy PLATFORM_API vs router blocked platform"
);

const htmlFacts = buildFactsFromLegacy({
  supplier: { id: "ferguson_shadow", domain: "ferguson.com" },
});
Object.assign(htmlFacts, {
  hasSchemaMarkup: true,
  renderingType: "SERVER_RENDERED" as const,
  antiBotRisk: "LOW" as const,
});
const fergusonLegacy = resolveLegacyStrategy({
  supplierId: htmlFacts.supplierId,
  legacySnapshot: htmlFacts.legacySnapshot,
});
const fergusonRouter = resolveExtractionStrategy({
  supplierId: htmlFacts.supplierId,
  facts: htmlFacts,
});
const directBeatsSerp = shadowCompare({
  legacy: fergusonLegacy,
  router: fergusonRouter,
  facts: htmlFacts,
});
assert(
  directBeatsSerp.matchStatus === "EXPECTED_FUTURE" &&
    directBeatsSerp.mismatchType === "DIRECT_OUTRANKS_SERP",
  "expected future: direct extraction outranks legacy SERP"
);

const capFacts = buildFactsFromLegacy({
  supplier: { id: "cap_shadow", domain: null },
  audit: { capabilityOnly: true },
});
const capLegacy = resolveLegacyStrategy({
  supplierId: capFacts.supplierId,
  legacySnapshot: capFacts.legacySnapshot,
});
const capRouter = resolveExtractionStrategy({ supplierId: capFacts.supplierId, facts: capFacts });
const capShadow = shadowCompare({
  legacy: { strategy: "SERP_SITE_ORGANIC", reason: "forced_wrong_legacy" },
  router: capRouter,
  facts: capFacts,
});
assert(
  capShadow.matchStatus === "EXPECTED_FUTURE" &&
    capShadow.mismatchType === "PROFILE_INSTEAD_OF_SERP",
  "expected future: profile when allowSerpFallback false"
);

const investigate = shadowCompare({
  legacy: { strategy: "SERP_PRODUCT_ENGINE", reason: "test" },
  router: stubRouterResolution("PROBABILISTIC_CATEGORY_PROFILE", {
    strategyConfidence: 0.5,
    tier: 5,
  }),
  facts: {
    supplierId: "weird",
    platformAccessStatus: "ACCESSIBLE",
    allowSerpFallback: true,
    legacySnapshot: { matchKind: "product_engine", mode: "product_engine" },
  },
});
assert(investigate.matchStatus === "INVESTIGATE", "investigate unexpected mismatch");

const drift = shadowCompare({
  legacy: {
    strategy: "PLATFORM_API",
    reason: "test",
    legacyMode: "bloomreach",
  },
  router: stubRouterResolution("PLATFORM_API", {
    strategyConfidence: 1,
    directExtractionViable: true,
    tier: 1,
  }),
  facts: {
    supplierId: "drift",
    platformAccessStatus: "BINDING_INCOMPLETE",
    allowSerpFallback: false,
    legacySnapshot: { matchKind: "registry_prefix", mode: "sli" },
  },
});
assert(drift.matchStatus === "LEGACY_SNAPSHOT_DRIFT", "legacy snapshot drift");

console.log("\nAll shadowCompare tests passed.\n");
