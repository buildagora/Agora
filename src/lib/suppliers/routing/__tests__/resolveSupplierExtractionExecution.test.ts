import { config } from "dotenv";
config({ path: ".env.local" });

import type { ExtractionStrategy } from "@prisma/client";
import type { SupplierFingerprintFacts } from "../../fingerprint/types";
import type { SupplierProductResult } from "../../types";
import { buildFactsFromLegacy } from "../../fingerprint/buildFactsFromLegacy";
import { executeExtractionStrategyChain } from "../executeExtractionStrategyChain";
import type { ExecuteExtractionStrategyResult } from "../executeExtractionStrategy";
import { resolveExtractionStrategy } from "../resolveExtractionStrategy";
import { runSupplierDiscoveryRouting } from "../resolveSupplierExtraction.server";
import type { SupplierExtractionRouteEvent } from "../routerTelemetry";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
  console.log(`PASS: ${message}`);
}

function baseFacts(supplierId: string): SupplierFingerprintFacts {
  return {
    supplierId,
    canonicalDomain: "ferguson.com",
    detectedPlatform: "UNKNOWN",
    platformDetectionConfidence: 1,
    platformDetectionSource: "legacy_config",
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
    allowSerpFallback: true,
    fingerprintStatus: "SUCCESS",
    lastFingerprintedAt: null,
    legacySnapshot: {
      matchKind: "site_organic",
      mode: "site_organic",
      domain: "ferguson.com",
    },
    notes: null,
  };
}

function platformFacts(supplierId: string): SupplierFingerprintFacts {
  return {
    ...baseFacts(supplierId),
    canonicalDomain: "johnstonesupply.com",
    detectedPlatform: "SLI",
    platformAccessStatus: "ACCESSIBLE",
    platformBindingValid: true,
    allowSerpFallback: false,
    legacySnapshot: {
      matchKind: "registry_prefix",
      mode: "sli",
      domain: "johnstonesupply.com",
    },
  };
}

const platformResult: SupplierProductResult = {
  title: "Johnstone Filter",
  productUrl: "https://www.johnstonesupply.com/p/filter",
  supplierId: "johnstone_atl",
  source: "JOHNSTONE",
};

const publicApiResult: SupplierProductResult = {
  title: "Luxe Sand Matte Porcelain Tile",
  productUrl: "https://www.flooranddecor.com/porcelain-tile/luxe-sand-matte-porcelain-tile-101317733.html",
  supplierId: "floor_decor_hsv",
  source: "GENERIC",
  price: "2.99",
};

function floorPublicFacts(supplierId: string): SupplierFingerprintFacts {
  return buildFactsFromLegacy({
    supplier: { id: supplierId, domain: "flooranddecor.com" },
  });
}

const legacyResult: SupplierProductResult = {
  title: "Legacy Product",
  productUrl: "https://ferguson.com/p/legacy",
  supplierId: "ferguson_wdc",
  source: "FERGUSON",
};

const routerResult: SupplierProductResult = {
  title: "Router Product",
  productUrl: "https://ferguson.com/p/router",
  supplierId: "ferguson_wdc",
  source: "FERGUSON",
};

const profileResult: SupplierProductResult = {
  title: "Likely carries: Mueller — Copper Pipe",
  productUrl: "https://ferguson.com/cat",
  supplierId: "ferguson_wdc",
  source: "FERGUSON",
  price: null,
  imageUrl: null,
  classification: "BRAND_PAGE",
  rankingSignals: ["capability_profile", "inferred_match", "no_live_inventory"],
};

function chainWithMock(
  mock: (
    strategy: ExtractionStrategy
  ) => Promise<ExecuteExtractionStrategyResult>
) {
  return (
    input: Parameters<typeof executeExtractionStrategyChain>[0],
    chainDeps?: Parameters<typeof executeExtractionStrategyChain>[1]
  ) =>
    executeExtractionStrategyChain(input, {
      ...chainDeps,
      executeStrategy: async (execInput) => mock(execInput.strategy),
    });
}

console.log("\nresolveSupplierExtractionExecution tests\n");

async function main() {
  let legacyCalls = 0;
  const legacyDiscovery = async () => {
    legacyCalls += 1;
    return [legacyResult];
  };

  const resultsOff = await runSupplierDiscoveryRouting(
    { supplierId: "ferguson_wdc", query: "pipe", dbDomain: "ferguson.com" },
    legacyDiscovery,
    {
      isShadowEnabled: () => false,
      isRouterEnabled: () => false,
      loadFacts: async () => {
        throw new Error("should not load facts when flags off");
      },
    }
  );
  assert(resultsOff[0]?.title === "Legacy Product", "flags off → legacy only");
  assert(legacyCalls === 1, "flags off → no chain walking");

  legacyCalls = 0;
  let serpCalls = 0;
  let lastEvent: SupplierExtractionRouteEvent | null = null;

  const routerResults = await runSupplierDiscoveryRouting(
    { supplierId: "ferguson_wdc", query: "pipe", dbDomain: "ferguson.com" },
    legacyDiscovery,
    {
      isShadowEnabled: () => true,
      isRouterEnabled: () => true,
      isAllowlisted: () => true,
      loadFacts: async () => baseFacts("ferguson_wdc"),
      executeChain: chainWithMock(async (strategy) => {
        if (strategy === "SERP_SITE_ORGANIC") {
          serpCalls += 1;
          return { status: "success", results: [routerResult] };
        }
        return { status: "unsupported", reason: "mock" };
      }),
      logRoute: (payload) => {
        lastEvent = payload;
      },
    }
  );
  assert(routerResults[0]?.title === "Router Product", "chain success returns results");
  assert(legacyCalls === 0, "chain success → no legacy call");
  assert(serpCalls === 1, "SERP success → one Serp call");
  assert(lastEvent!.executionPath === "router", "telemetry executionPath=router");
  assert(lastEvent!.fallbackDepth === 0, "primary success → fallbackDepth 0");
  assert(
    lastEvent!.finalStrategyUsed === "SERP_SITE_ORGANIC",
    "finalStrategyUsed recorded"
  );
  assert(
    lastEvent!.primaryStrategy === "SERP_SITE_ORGANIC",
    "primaryStrategy in telemetry"
  );
  assert(
    lastEvent!.routerStrategy === "SERP_SITE_ORGANIC",
    "routerStrategy shadow field preserved"
  );

  legacyCalls = 0;
  serpCalls = 0;
  lastEvent = null;

  await runSupplierDiscoveryRouting(
    { supplierId: "ferguson_wdc", query: "pipe", dbDomain: "ferguson.com" },
    legacyDiscovery,
    {
      isShadowEnabled: () => false,
      isRouterEnabled: () => true,
      isAllowlisted: () => false,
      loadFacts: async () => baseFacts("ferguson_wdc"),
      executeChain: chainWithMock(async () => {
        serpCalls += 1;
        return { status: "success", results: [routerResult] };
      }),
      logRoute: (payload) => {
        lastEvent = payload;
      },
    }
  );
  assert(legacyCalls === 1, "not allowlisted → legacy fallback");
  assert(serpCalls === 0, "not allowlisted → no chain walking");
  assert(lastEvent!.executionPath === "legacy_fallback", "not allowlisted → legacy_fallback");
  assert(lastEvent!.fallbackReason === "not_allowlisted", "not allowlisted reason");

  legacyCalls = 0;
  serpCalls = 0;
  lastEvent = null;

  await runSupplierDiscoveryRouting(
    { supplierId: "ferguson_wdc", query: "pipe", dbDomain: "ferguson.com" },
    legacyDiscovery,
    {
      isShadowEnabled: () => false,
      isRouterEnabled: () => true,
      isAllowlisted: () => true,
      loadFacts: async () => baseFacts("ferguson_wdc"),
      executeChain: chainWithMock(async (strategy) => {
        if (strategy === "SERP_SITE_ORGANIC") {
          serpCalls += 1;
          return { status: "empty" };
        }
        if (strategy === "PROBABILISTIC_CATEGORY_PROFILE") {
          return { status: "empty" };
        }
        return { status: "unsupported", reason: "mock" };
      }),
      logRoute: (payload) => {
        lastEvent = payload;
      },
    }
  );
  assert(legacyCalls === 1, "chain exhausted → legacy fallback once");
  assert(serpCalls === 1, "chain exhausted → single Serp attempt");
  assert(lastEvent!.fallbackReason === "chain_exhausted", "chain exhausted reason");
  assert(
    (lastEvent!.attemptedStrategies?.length ?? 0) >= 2,
    "attemptedStrategies records chain walk including profile"
  );

  legacyCalls = 0;
  serpCalls = 0;
  lastEvent = null;

  const profileChainResults = await runSupplierDiscoveryRouting(
    { supplierId: "ferguson_wdc", query: "copper pipe", dbDomain: "ferguson.com" },
    legacyDiscovery,
    {
      isShadowEnabled: () => false,
      isRouterEnabled: () => true,
      isAllowlisted: () => true,
      loadFacts: async () => baseFacts("ferguson_wdc"),
      executeChain: chainWithMock(async (strategy) => {
        if (strategy === "SERP_SITE_ORGANIC") {
          serpCalls += 1;
          return { status: "empty" };
        }
        if (strategy === "PROBABILISTIC_CATEGORY_PROFILE") {
          return {
            status: "success",
            results: [profileResult],
            capabilityProfile: {
              capabilityMatchCount: 1,
              capabilityScoreMin: 12,
              capabilityScoreMax: 12,
            },
          };
        }
        return { status: "unsupported", reason: "mock" };
      }),
      logRoute: (payload) => {
        lastEvent = payload;
      },
    }
  );
  assert(
    profileChainResults[0]?.title.startsWith("Likely carries:"),
    "SERP empty → profile success returns profile results"
  );
  assert(legacyCalls === 0, "SERP empty → profile success → no legacy");
  assert(serpCalls === 1, "SERP empty → profile success → one Serp attempt");
  assert(lastEvent!.executionPath === "router", "profile success → executionPath=router");
  assert(
    lastEvent!.finalStrategyUsed === "PROBABILISTIC_CATEGORY_PROFILE",
    "profile success → finalStrategyUsed=PROBABILISTIC_CATEGORY_PROFILE"
  );
  const profileAttempt = lastEvent!.attemptedStrategies?.find(
    (a) => a.strategy === "PROBABILISTIC_CATEGORY_PROFILE"
  );
  assert(profileAttempt?.status === "success", "profile attempt recorded as success");
  assert(
    profileAttempt?.capabilityMatchCount === 1,
    "profile attempt includes capabilityMatchCount"
  );
  assert(
    profileAttempt?.capabilityScoreMin === 12,
    "profile attempt includes capabilityScoreMin"
  );
  assert(
    profileAttempt?.capabilityScoreMax === 12,
    "profile attempt includes capabilityScoreMax"
  );

  legacyCalls = 0;
  serpCalls = 0;
  lastEvent = null;

  const publicSuccessResults = await runSupplierDiscoveryRouting(
    { supplierId: "floor_decor_hsv", query: "tile", dbDomain: "flooranddecor.com" },
    legacyDiscovery,
    {
      isShadowEnabled: () => false,
      isRouterEnabled: () => true,
      isAllowlisted: () => true,
      loadFacts: async () => floorPublicFacts("floor_decor_hsv"),
      executeChain: chainWithMock(async (strategy) => {
        if (strategy === "PUBLIC_API") {
          return { status: "success", results: [publicApiResult] };
        }
        return { status: "unsupported", reason: "mock" };
      }),
      logRoute: (payload) => {
        lastEvent = payload;
      },
    }
  );
  assert(
    publicSuccessResults[0]?.title === "Luxe Sand Matte Porcelain Tile",
    "PUBLIC_API success returns router results"
  );
  assert(legacyCalls === 0, "PUBLIC_API success → legacy not called");
  assert(serpCalls === 0, "PUBLIC_API success → Serp not called");
  assert(lastEvent!.executionPath === "router", "public success → executionPath=router");
  assert(
    lastEvent!.finalStrategyUsed === "PUBLIC_API",
    "public success → finalStrategyUsed=PUBLIC_API"
  );
  assert(lastEvent!.fallbackDepth === 0, "public success → fallbackDepth=0");
  assert(
    (lastEvent!.attemptedStrategies?.some(
      (a) => a.strategy === "PUBLIC_API" && a.status === "success"
    ) ?? false),
    "attemptedStrategies includes PUBLIC_API success"
  );

  legacyCalls = 0;
  serpCalls = 0;
  lastEvent = null;

  const publicProfileResults = await runSupplierDiscoveryRouting(
    { supplierId: "floor_decor_hsv", query: "tile", dbDomain: "flooranddecor.com" },
    legacyDiscovery,
    {
      isShadowEnabled: () => false,
      isRouterEnabled: () => true,
      isAllowlisted: () => true,
      loadFacts: async () => floorPublicFacts("floor_decor_hsv"),
      executeChain: chainWithMock(async (strategy) => {
        if (strategy === "PUBLIC_API") {
          return { status: "empty" };
        }
        if (strategy === "PROBABILISTIC_CATEGORY_PROFILE") {
          return {
            status: "success",
            results: [profileResult],
            capabilityProfile: {
              capabilityMatchCount: 1,
              capabilityScoreMin: 12,
              capabilityScoreMax: 12,
            },
          };
        }
        return { status: "unsupported", reason: "mock" };
      }),
      logRoute: (payload) => {
        lastEvent = payload;
      },
    }
  );
  assert(
    publicProfileResults[0]?.title.startsWith("Likely carries:"),
    "PUBLIC_API empty falls through to profile success"
  );
  assert(legacyCalls === 0, "public empty → profile success → no legacy");
  assert(
    (lastEvent!.fallbackDepth ?? 0) > 0,
    "public empty → profile success → fallbackDepth > 0"
  );

  legacyCalls = 0;
  serpCalls = 0;
  lastEvent = null;

  await runSupplierDiscoveryRouting(
    { supplierId: "floor_decor_hsv", query: "tile", dbDomain: "flooranddecor.com" },
    legacyDiscovery,
    {
      isShadowEnabled: () => false,
      isRouterEnabled: () => true,
      isAllowlisted: () => true,
      loadFacts: async () => floorPublicFacts("floor_decor_hsv"),
      executeChain: chainWithMock(async (strategy) => {
        if (strategy === "PUBLIC_API") {
          return { status: "error", reason: "public api down" };
        }
        if (strategy === "PROBABILISTIC_CATEGORY_PROFILE") {
          return { status: "empty" };
        }
        return { status: "unsupported", reason: "mock" };
      }),
      logRoute: (payload) => {
        lastEvent = payload;
      },
    }
  );
  assert(legacyCalls === 1, "public error → profile empty → legacy called once");
  assert(
    (lastEvent!.attemptedStrategies?.some(
      (a) => a.strategy === "PUBLIC_API" && a.status === "error"
    ) ?? false),
    "attemptedStrategies records PUBLIC_API error"
  );

  legacyCalls = 0;
  serpCalls = 0;
  lastEvent = null;

  const platformSuccessResults = await runSupplierDiscoveryRouting(
    { supplierId: "johnstone_atl", query: "filter", dbDomain: "johnstonesupply.com" },
    legacyDiscovery,
    {
      isShadowEnabled: () => false,
      isRouterEnabled: () => true,
      isAllowlisted: () => true,
      loadFacts: async () => platformFacts("johnstone_atl"),
      executeChain: chainWithMock(async (strategy) => {
        if (strategy === "PLATFORM_API") {
          return { status: "success", results: [platformResult] };
        }
        return { status: "unsupported", reason: "mock" };
      }),
      logRoute: (payload) => {
        lastEvent = payload;
      },
    }
  );
  assert(
    platformSuccessResults[0]?.title === "Johnstone Filter",
    "PLATFORM_API success returns router results"
  );
  assert(legacyCalls === 0, "PLATFORM_API success → legacy not called");
  assert(serpCalls === 0, "PLATFORM_API success → Serp not called");
  assert(lastEvent!.executionPath === "router", "platform success → executionPath=router");
  assert(
    lastEvent!.finalStrategyUsed === "PLATFORM_API",
    "platform success → finalStrategyUsed=PLATFORM_API"
  );
  assert(lastEvent!.fallbackDepth === 0, "platform success → fallbackDepth=0");
  assert(
    (lastEvent!.attemptedStrategies?.some(
      (a) => a.strategy === "PLATFORM_API" && a.status === "success"
    ) ?? false),
    "attemptedStrategies includes PLATFORM_API success"
  );

  legacyCalls = 0;
  serpCalls = 0;
  lastEvent = null;

  const platformProfileResults = await runSupplierDiscoveryRouting(
    { supplierId: "johnstone_atl", query: "filter", dbDomain: "johnstonesupply.com" },
    legacyDiscovery,
    {
      isShadowEnabled: () => false,
      isRouterEnabled: () => true,
      isAllowlisted: () => true,
      loadFacts: async () => platformFacts("johnstone_atl"),
      executeChain: chainWithMock(async (strategy) => {
        if (strategy === "PLATFORM_API") {
          return { status: "empty" };
        }
        if (strategy === "PROBABILISTIC_CATEGORY_PROFILE") {
          return {
            status: "success",
            results: [profileResult],
            capabilityProfile: {
              capabilityMatchCount: 1,
              capabilityScoreMin: 12,
              capabilityScoreMax: 12,
            },
          };
        }
        return { status: "unsupported", reason: "mock" };
      }),
      logRoute: (payload) => {
        lastEvent = payload;
      },
    }
  );
  assert(
    platformProfileResults[0]?.title.startsWith("Likely carries:"),
    "PLATFORM_API empty falls through to profile success"
  );
  assert(legacyCalls === 0, "platform empty → profile success → no legacy");
  assert(
    (lastEvent!.fallbackDepth ?? 0) > 0,
    "platform empty → profile success → fallbackDepth > 0"
  );

  legacyCalls = 0;
  serpCalls = 0;
  lastEvent = null;

  await runSupplierDiscoveryRouting(
    { supplierId: "johnstone_atl", query: "filter", dbDomain: "johnstonesupply.com" },
    legacyDiscovery,
    {
      isShadowEnabled: () => false,
      isRouterEnabled: () => true,
      isAllowlisted: () => true,
      loadFacts: async () => platformFacts("johnstone_atl"),
      executeChain: chainWithMock(async (strategy) => {
        if (strategy === "PLATFORM_API") {
          return { status: "error", reason: "platform down" };
        }
        if (strategy === "PROBABILISTIC_CATEGORY_PROFILE") {
          return { status: "empty" };
        }
        return { status: "unsupported", reason: "mock" };
      }),
      logRoute: (payload) => {
        lastEvent = payload;
      },
    }
  );
  assert(legacyCalls === 1, "platform error → profile empty → legacy called once");
  assert(
    (lastEvent!.attemptedStrategies?.some(
      (a) => a.strategy === "PLATFORM_API" && a.status === "error"
    ) ?? false),
    "attemptedStrategies records PLATFORM_API error"
  );

  legacyCalls = 0;
  serpCalls = 0;
  lastEvent = null;

  const platformSerpFacts: SupplierFingerprintFacts = {
    ...platformFacts("johnstone_atl"),
    allowSerpFallback: true,
  };

  const platformResults = await runSupplierDiscoveryRouting(
    { supplierId: "johnstone_atl", query: "filter", dbDomain: "johnstonesupply.com" },
    legacyDiscovery,
    {
      isShadowEnabled: () => false,
      isRouterEnabled: () => true,
      isAllowlisted: () => true,
      loadFacts: async () => platformSerpFacts,
      executeChain: chainWithMock(async (strategy) => {
        if (strategy === "PLATFORM_API") {
          return { status: "unsupported", reason: "not_implemented" };
        }
        if (strategy === "SERP_SITE_ORGANIC") {
          serpCalls += 1;
          return { status: "success", results: [routerResult] };
        }
        return { status: "unsupported", reason: "mock" };
      }),
      logRoute: (payload) => {
        lastEvent = payload;
      },
    }
  );
  assert(platformResults[0]?.title === "Router Product", "platform unsupported → Serp success");
  assert(legacyCalls === 0, "platform → Serp chain success → no legacy");
  assert(serpCalls === 1, "platform → Serp uses Serp once");
  assert(
    (lastEvent!.fallbackDepth ?? 0) > 0,
    "platform → Serp success → fallbackDepth > 0"
  );

  legacyCalls = 0;
  serpCalls = 0;

  await runSupplierDiscoveryRouting(
    { supplierId: "ferguson_wdc", query: "pipe", dbDomain: "ferguson.com" },
    legacyDiscovery,
    {
      isShadowEnabled: () => false,
      isRouterEnabled: () => true,
      isAllowlisted: () => true,
      loadFacts: async () => ({
        ...baseFacts("ferguson_wdc"),
        platformAccessStatus: "BINDING_INCOMPLETE",
      }),
      executeChain: chainWithMock(async (strategy) => {
        if (strategy === "SERP_SITE_ORGANIC") {
          serpCalls += 1;
          return { status: "success", results: [routerResult] };
        }
        return { status: "unsupported", reason: "mock" };
      }),
    }
  );
  assert(legacyCalls === 0, "binding incomplete does not block chain; Serp can succeed");
  assert(serpCalls === 1, "binding incomplete site-organic still attempts Serp in chain");

  legacyCalls = 0;
  serpCalls = 0;

  await runSupplierDiscoveryRouting(
    { supplierId: "missing_fp", query: "pipe", dbDomain: "example.com" },
    legacyDiscovery,
    {
      isShadowEnabled: () => false,
      isRouterEnabled: () => true,
      isAllowlisted: () => true,
      loadFacts: async () => null,
      executeChain: chainWithMock(async () => {
        serpCalls += 1;
        return { status: "success", results: [routerResult] };
      }),
    }
  );
  assert(legacyCalls === 1, "missing fingerprint → legacy");
  assert(serpCalls === 0, "missing fingerprint → no chain");

  legacyCalls = 0;
  serpCalls = 0;
  lastEvent = null;

  await runSupplierDiscoveryRouting(
    { supplierId: "ferguson_wdc", query: "pipe", dbDomain: "ferguson.com" },
    legacyDiscovery,
    {
      isShadowEnabled: () => false,
      isRouterEnabled: () => true,
      isAllowlisted: () => true,
      loadFacts: async () => baseFacts("ferguson_wdc"),
      executeChain: chainWithMock(async (strategy) => {
        if (strategy === "SERP_SITE_ORGANIC") {
          serpCalls += 1;
          await new Promise((resolve) => setTimeout(resolve, 50));
          return { status: "success", results: [routerResult] };
        }
        return { status: "unsupported", reason: "mock" };
      }),
      executionTimeoutMs: 1,
      logRoute: (payload) => {
        lastEvent = payload;
      },
    }
  );
  assert(legacyCalls === 1, "timeout on primary → continue chain → legacy if exhausted");
  assert(serpCalls === 1, "timeout → primary attempted once");

  legacyCalls = 0;
  lastEvent = null;

  await runSupplierDiscoveryRouting(
    { supplierId: "johnstone_atl", query: "filter", dbDomain: "johnstonesupply.com" },
    legacyDiscovery,
    {
      isShadowEnabled: () => false,
      isRouterEnabled: () => true,
      isAllowlisted: () => true,
      loadFacts: async () => ({
        ...baseFacts("johnstone_atl"),
        canonicalDomain: "johnstonesupply.com",
        detectedPlatform: "UNKNOWN",
        platformAccessStatus: "NOT_APPLICABLE",
        platformBindingValid: false,
        renderingType: "SERVER_RENDERED",
        antiBotRisk: "LOW",
        allowSerpFallback: true,
        legacySnapshot: {
          matchKind: "registry_prefix",
          mode: "sli",
          domain: "johnstonesupply.com",
        },
      }),
      executeChain: chainWithMock(async () => ({
        status: "success",
        results: [routerResult],
      })),
      logRoute: (payload) => {
        lastEvent = payload;
      },
    }
  );
  assert(
    lastEvent!.fallbackReason === "investigate_mismatch",
    "INVESTIGATE → no chain walking"
  );
  assert(legacyCalls === 1, "INVESTIGATE → legacy once");

  const plan = resolveExtractionStrategy({
    supplierId: "ferguson_wdc",
    facts: baseFacts("ferguson_wdc"),
  });
  assert(
    plan.chosenStrategy === plan.primaryStrategy,
    "chosenStrategy alias remains backward compatible"
  );

  console.log("\nAll resolveSupplierExtractionExecution tests passed.\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
