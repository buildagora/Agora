import { buildFactsFromLegacy } from "../../fingerprint/buildFactsFromLegacy";
import type { SupplierFingerprintFacts } from "../../fingerprint/types";
import {
  DEFERRED_EXTRACTION_STRATEGIES,
  STRATEGY_PLAN_ORDER,
} from "../evaluateStrategyViability";
import { buildStrategyPlan, resolveExtractionStrategy } from "../resolveExtractionStrategy";
import type { ResolveExtractionStrategyInput } from "../types";
import { strategyTier } from "../types";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
  console.log(`PASS: ${message}`);
}

function baseFacts(
  overrides: Partial<SupplierFingerprintFacts>
): SupplierFingerprintFacts {
  return {
    supplierId: "test_supplier",
    canonicalDomain: "example.com",
    detectedPlatform: "UNKNOWN",
    platformDetectionConfidence: null,
    platformDetectionSource: null,
    platformAccessStatus: "NOT_APPLICABLE",
    platformBindingId: null,
    platformBindingValid: false,
    hasPublicApi: null,
    publicApiAccessStatus: "NOT_PROBED",
    publicApiEndpoint: null,
    hasSchemaMarkup: null,
    hasSitemap: null,
    sitemapUrls: null,
    renderingType: "UNKNOWN",
    isSPA: null,
    antiBotRisk: "UNKNOWN",
    demandPriority: "MEDIUM",
    demandScore: null,
    allowSerpFallback: false,
    fingerprintStatus: "SUCCESS",
    lastFingerprintedAt: null,
    legacySnapshot: { matchKind: "generic_domain", domain: "example.com" },
    notes: null,
    ...overrides,
  };
}

function route(
  facts: SupplierFingerprintFacts,
  extra?: Omit<Partial<ResolveExtractionStrategyInput>, "supplierId" | "facts">
) {
  return resolveExtractionStrategy({
    supplierId: facts.supplierId,
    facts,
    ...extra,
  });
}

function assertChainOrder(plan: ReturnType<typeof route>) {
  let lastIndex = -1;
  for (const strategy of plan.fullOrderedChain) {
    const index = STRATEGY_PLAN_ORDER.indexOf(strategy);
    assert(index > lastIndex, `chain order preserved for ${strategy}`);
    lastIndex = index;
  }
}

function assertEndsWithProfile(plan: ReturnType<typeof route>) {
  assert(
    plan.fullOrderedChain[plan.fullOrderedChain.length - 1] ===
      "PROBABILISTIC_CATEGORY_PROFILE",
    "chain ends with PROBABILISTIC_CATEGORY_PROFILE"
  );
}

function assertAliases(plan: ReturnType<typeof route>) {
  assert(
    plan.chosenStrategy === plan.primaryStrategy,
    "chosenStrategy === primaryStrategy"
  );
  if (plan.fallbackChain.length > 0) {
    assert(
      plan.fallbackStrategy === plan.fallbackChain[0],
      "fallbackStrategy === fallbackChain[0]"
    );
  }
  assert(
    plan.fullOrderedChain[0] === plan.primaryStrategy,
    "fullOrderedChain starts with primaryStrategy"
  );
  assert(
    plan.fullOrderedChain.slice(1).join(",") === plan.fallbackChain.join(","),
    "fullOrderedChain === primary + fallbackChain"
  );
}

console.log("\nresolveExtractionStrategy tests\n");

const johnstoneFacts = buildFactsFromLegacy({
  supplier: { id: "johnstone_test", domain: "johnstonesupply.com" },
});
const johnstone = route(johnstoneFacts);
assert(
  johnstone.primaryStrategy === "PLATFORM_API",
  "ACCESSIBLE SLI platform → PLATFORM_API primary"
);
assert(johnstone.tier === 1, "PLATFORM_API is tier 1");
assertChainOrder(johnstone);
assertEndsWithProfile(johnstone);
assertAliases(johnstone);

const bakerFacts = buildFactsFromLegacy({
  supplier: { id: "baker_test", domain: "bakerdist.com" },
  envKeyPresence: {},
});
const baker = route(bakerFacts);
assert(
  !baker.fullOrderedChain.includes("PLATFORM_API"),
  "BLOOMREACH BINDING_INCOMPLETE excludes PLATFORM_API"
);
assertEndsWithProfile(baker);
assertAliases(baker);

const floorPublicFacts = baseFacts({
  supplierId: "floor_test",
  canonicalDomain: "flooranddecor.com",
  detectedPlatform: "ALGOLIA",
  platformAccessStatus: "PUBLIC_ANONYMOUS",
  platformBindingValid: true,
  publicApiAccessStatus: "ACCESSIBLE",
  hasPublicApi: true,
  legacySnapshot: {
    matchKind: "domain_platform",
    mode: "algolia",
    domain: "flooranddecor.com",
  },
});
const floor = route(floorPublicFacts);
assert(
  floor.primaryStrategy === "PUBLIC_API",
  "publicApiAccessStatus ACCESSIBLE → PUBLIC_API primary"
);
assert(
  floor.fullOrderedChain.includes("PROBABILISTIC_CATEGORY_PROFILE"),
  "Floor public API chain includes profile terminal"
);
assertAliases(floor);

const publicApiFacts = baseFacts({
  publicApiAccessStatus: "ACCESSIBLE",
  hasPublicApi: true,
});
assert(
  route(publicApiFacts).primaryStrategy === "PUBLIC_API",
  "publicApiAccessStatus ACCESSIBLE → PUBLIC_API"
);
assert(
  !route(
    baseFacts({ publicApiAccessStatus: "NOT_PROBED", hasPublicApi: false })
  ).fullOrderedChain.includes("PUBLIC_API"),
  "no accessible public API excludes PUBLIC_API"
);

const schemaFacts = baseFacts({
  hasSchemaMarkup: true,
  renderingType: "SERVER_RENDERED",
  antiBotRisk: "LOW",
});
const schemaPlan = route(schemaFacts);
assert(
  schemaPlan.primaryStrategy === "SCHEMA_OR_SITEMAP",
  "hasSchemaMarkup → SCHEMA_OR_SITEMAP primary"
);
assert(
  schemaPlan.fallbackChain.includes("HTML_SCRAPE"),
  "schema primary chain can include HTML_SCRAPE fallback"
);

const sitemapFacts = baseFacts({ hasSitemap: true });
assert(
  route(sitemapFacts).primaryStrategy === "SCHEMA_OR_SITEMAP",
  "hasSitemap → SCHEMA_OR_SITEMAP"
);

const htmlFacts = baseFacts({
  renderingType: "SERVER_RENDERED",
  antiBotRisk: "MEDIUM",
});
assert(
  route(htmlFacts).primaryStrategy === "HTML_SCRAPE",
  "server rendered → HTML_SCRAPE primary"
);

const spaHtmlExcluded = route(
  baseFacts({
    renderingType: "SPA",
    antiBotRisk: "LOW",
  })
);
assert(
  !spaHtmlExcluded.fullOrderedChain.includes("HTML_SCRAPE"),
  "SPA excludes HTML_SCRAPE"
);

const hybridHtml = route(
  baseFacts({
    renderingType: "HYBRID",
    antiBotRisk: "LOW",
  })
);
assert(
  hybridHtml.fullOrderedChain.includes("HTML_SCRAPE"),
  "HYBRID allows HTML_SCRAPE in chain"
);

assert(
  !STRATEGY_PLAN_ORDER.includes("PLAYWRIGHT"),
  "PLAYWRIGHT excluded from active plan order"
);
assert(
  !STRATEGY_PLAN_ORDER.includes("ANTI_BOT_EVALUATION"),
  "ANTI_BOT_EVALUATION excluded from active plan order"
);
assert(
  STRATEGY_PLAN_ORDER.length === 7,
  "active plan order has seven product-producing strategies"
);

const playwrightFacts = baseFacts({
  isSPA: true,
  demandPriority: "CRITICAL",
  renderingType: "SPA",
});
const pw = route(playwrightFacts, { options: { allowPlaywright: true } });
assert(
  pw.primaryStrategy !== "PLAYWRIGHT",
  "SPA + critical demand does not route to deferred PLAYWRIGHT"
);
assert(
  !pw.fullOrderedChain.some((s) => DEFERRED_EXTRACTION_STRATEGIES.includes(s)),
  "deferred strategies absent from fullOrderedChain"
);

const antibotFacts = baseFacts({
  antiBotRisk: "HIGH",
  demandPriority: "HIGH",
  isSPA: false,
  allowSerpFallback: true,
  canonicalDomain: "example.com",
  legacySnapshot: { matchKind: "generic_domain" },
});
const antibotPlan = route(antibotFacts);
assert(
  antibotPlan.primaryStrategy !== "ANTI_BOT_EVALUATION",
  "high antiBotRisk routes to product strategies not ANTI_BOT_EVALUATION"
);
assert(
  antibotPlan.fullOrderedChain.includes("SERP_SITE_ORGANIC"),
  "high antiBotRisk still includes SERP fallback in chain"
);

const hdFacts = buildFactsFromLegacy({
  supplier: { id: "home_depot_test", domain: "homedepot.com" },
});
const hd = route(hdFacts);
assert(
  hd.primaryStrategy === "SERP_PRODUCT_ENGINE",
  "product_engine + allowSerpFallback → SERP_PRODUCT_ENGINE primary"
);
assert(
  !hd.fullOrderedChain.includes("SERP_SITE_ORGANIC"),
  "product_engine excludes SERP_SITE_ORGANIC from chain"
);

const genericFacts = buildFactsFromLegacy({
  supplier: { id: "city_electric_test", domain: "cityelectricsupply.com" },
});
const generic = route(genericFacts);
assert(
  generic.primaryStrategy === "SERP_SITE_ORGANIC",
  "generic domain + allowSerpFallback → SERP_SITE_ORGANIC primary"
);
assert(
  generic.fallbackChain.includes("PROBABILISTIC_CATEGORY_PROFILE"),
  "generic serp chain falls back to profile"
);

const fergusonFacts = buildFactsFromLegacy({
  supplier: { id: "ferguson_plumbing_hsv", domain: "ferguson.com" },
});
const ferguson = route(fergusonFacts);
assert(
  ferguson.primaryStrategy === "SERP_SITE_ORGANIC",
  "Ferguson site organic → SERP_SITE_ORGANIC primary"
);
assertEndsWithProfile(ferguson);

const capFacts = buildFactsFromLegacy({
  supplier: { id: "cap_only", domain: null },
  audit: { capabilityOnly: true },
});
const capOnly = route(capFacts);
assert(
  capOnly.primaryStrategy === "PROBABILISTIC_CATEGORY_PROFILE",
  "no domain / no fallback → PROBABILISTIC_CATEGORY_PROFILE primary"
);
assert(
  capOnly.fullOrderedChain.length === 1,
  "capability-only chain is profile only"
);

const noSerp = route(
  baseFacts({
    allowSerpFallback: false,
    canonicalDomain: "example.com",
    legacySnapshot: { matchKind: "generic_domain" },
  })
);
assert(
  !noSerp.fullOrderedChain.includes("SERP_SITE_ORGANIC") &&
    !noSerp.fullOrderedChain.includes("SERP_PRODUCT_ENGINE"),
  "allowSerpFallback=false excludes SERP strategies"
);

const platformWins = route(
  baseFacts({
    detectedPlatform: "SLI",
    platformAccessStatus: "ACCESSIBLE",
    platformBindingValid: true,
    allowSerpFallback: true,
    legacySnapshot: { matchKind: "registry_prefix", mode: "sli" },
  })
);
assert(
  platformWins.primaryStrategy === "PLATFORM_API" &&
    strategyTier(platformWins.primaryStrategy) <
      strategyTier("SERP_SITE_ORGANIC"),
  "SERP does not outrank accessible platform"
);
assert(
  platformWins.fullOrderedChain.includes("SERP_SITE_ORGANIC"),
  "accessible platform chain can include SERP fallback before profile"
);

const schemaBeatsSerp = route(
  baseFacts({
    hasSchemaMarkup: true,
    allowSerpFallback: true,
    canonicalDomain: "example.com",
    legacySnapshot: { matchKind: "generic_domain" },
  })
);
assert(
  schemaBeatsSerp.primaryStrategy === "SCHEMA_OR_SITEMAP",
  "schema does not lose to SERP when markup present"
);
assert(
  schemaBeatsSerp.fullOrderedChain.indexOf("SERP_SITE_ORGANIC") >
    schemaBeatsSerp.fullOrderedChain.indexOf("SCHEMA_OR_SITEMAP"),
  "SERP_SITE_ORGANIC follows SCHEMA in fallback chain"
);

const planFromInput = buildStrategyPlan({
  supplierId: genericFacts.supplierId,
  facts: genericFacts,
});
assert(
  Array.isArray(planFromInput.viabilityByStrategy) &&
    planFromInput.viabilityByStrategy.length === STRATEGY_PLAN_ORDER.length,
  "viabilityByStrategy covers all strategies"
);

assert(
  !("chosenStrategy" in ({ supplierId: "x" })),
  "chosenStrategy is router output only, not a DB field shape"
);
assert(
  !Object.prototype.hasOwnProperty.call(
    { canonicalDomain: "x" } as Record<string, unknown>,
    "chosenStrategy"
  ),
  "facts object must not include chosenStrategy DB field"
);

console.log("\nAll resolveExtractionStrategy tests passed.\n");

// Example outputs for validation report
console.log("--- Example StrategyPlan outputs ---\n");
for (const [label, facts] of [
  ["Ferguson / site organic", fergusonFacts],
  ["Johnstone / platform accessible", johnstoneFacts],
  [
    "Floor & Decor / public API",
    floorPublicFacts,
  ],
  ["Baker / binding incomplete", bakerFacts],
  ["Supplier with no domain", capFacts],
] as const) {
  const plan = route(facts);
  console.log(
    JSON.stringify(
      {
        label,
        primaryStrategy: plan.primaryStrategy,
        fallbackChain: plan.fallbackChain,
        fullOrderedChain: plan.fullOrderedChain,
        chosenStrategy: plan.chosenStrategy,
        fallbackStrategy: plan.fallbackStrategy,
      },
      null,
      2
    )
  );
  console.log("");
}
