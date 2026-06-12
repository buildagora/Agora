import { buildStrategyPlan } from "../resolveExtractionStrategy";
import { executeExtractionStrategyChain } from "../executeExtractionStrategyChain";
import { buildFactsFromLegacy } from "../../fingerprint/buildFactsFromLegacy";
import type { SupplierFingerprintFacts } from "../../fingerprint/types";
import type { SupplierProductResult } from "../../types";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
  console.log(`PASS: ${message}`);
}

function baseFacts(overrides: Partial<SupplierFingerprintFacts> = {}): SupplierFingerprintFacts {
  return {
    supplierId: "test_supplier",
    canonicalDomain: "example.com",
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
    legacySnapshot: { matchKind: "generic_domain", domain: "example.com" },
    notes: null,
    ...overrides,
  };
}

const sampleResult: SupplierProductResult = {
  title: "Product",
  productUrl: "https://example.com/p/1",
  supplierId: "test_supplier",
  source: "GENERIC",
};

console.log("\nexecuteExtractionStrategyChain tests\n");

async function main() {
  const serpOnlyFacts = baseFacts();
  const serpPlan = buildStrategyPlan({
    supplierId: serpOnlyFacts.supplierId,
    facts: serpOnlyFacts,
  });

  let calls = 0;
  const primarySuccess = await executeExtractionStrategyChain(
    {
      plan: serpPlan,
      supplierId: serpOnlyFacts.supplierId,
      query: "pipe",
      facts: serpOnlyFacts,
    },
    {
      executeStrategy: async (input) => {
        calls += 1;
        if (input.strategy === "SERP_SITE_ORGANIC") {
          return { status: "success", results: [sampleResult] };
        }
        return { status: "unsupported", reason: "mock" };
      },
    }
  );
  assert(primarySuccess.fallbackDepth === 0, "primary success → fallbackDepth 0");
  assert(
    primarySuccess.finalStrategyUsed === "SERP_SITE_ORGANIC",
    "finalStrategyUsed is primary"
  );
  assert(calls === 1, "primary success → one attempt");
  assert(!primarySuccess.chainExhausted, "primary success → chain not exhausted");

  const platformFacts = baseFacts({
    detectedPlatform: "SLI",
    platformAccessStatus: "ACCESSIBLE",
    platformBindingValid: true,
    legacySnapshot: { matchKind: "registry_prefix", mode: "sli" },
  });
  const platformPlan = buildStrategyPlan({
    supplierId: platformFacts.supplierId,
    facts: platformFacts,
  });
  assert(
    platformPlan.primaryStrategy === "PLATFORM_API",
    "platform facts → PLATFORM_API primary"
  );

  calls = 0;
  const fallthrough = await executeExtractionStrategyChain(
    {
      plan: platformPlan,
      supplierId: platformFacts.supplierId,
      query: "filter",
      facts: platformFacts,
    },
    {
      executeStrategy: async (input) => {
        calls += 1;
        if (input.strategy === "PLATFORM_API") {
          return { status: "unsupported", reason: "not_implemented" };
        }
        if (input.strategy === "SERP_SITE_ORGANIC") {
          return { status: "success", results: [sampleResult] };
        }
        return { status: "unsupported", reason: "mock" };
      },
    }
  );
  assert(
    fallthrough.finalStrategyUsed === "SERP_SITE_ORGANIC",
    "unsupported PLATFORM_API falls through to SERP_SITE_ORGANIC"
  );
  assert(fallthrough.fallbackDepth > 0, "Serp after platform → fallbackDepth > 0");
  assert(
    fallthrough.attempts.some((a) => a.strategy === "PLATFORM_API" && a.status === "unsupported"),
    "attemptedStrategies records PLATFORM_API unsupported"
  );

  const emptyThenSuccess = await executeExtractionStrategyChain(
    {
      plan: platformPlan,
      supplierId: platformFacts.supplierId,
      query: "filter",
      facts: platformFacts,
    },
    {
      executeStrategy: async (input) => {
        if (input.strategy === "PLATFORM_API") {
          return { status: "empty" };
        }
        if (input.strategy === "SERP_SITE_ORGANIC") {
          return { status: "success", results: [sampleResult] };
        }
        return { status: "unsupported", reason: "mock" };
      },
    }
  );
  assert(
    emptyThenSuccess.finalStrategyUsed === "SERP_SITE_ORGANIC",
    "primary empty → next strategy attempted"
  );
  assert(
    emptyThenSuccess.attempts.some((a) => a.status === "empty"),
    "attemptedStrategies records empty attempt"
  );

  const exhausted = await executeExtractionStrategyChain(
    {
      plan: serpPlan,
      supplierId: serpOnlyFacts.supplierId,
      query: "pipe",
      facts: serpOnlyFacts,
    },
    {
      executeStrategy: async () => ({ status: "empty" }),
    }
  );
  assert(exhausted.chainExhausted, "all strategies fail → chainExhausted");
  assert(exhausted.results.length === 0, "exhausted chain returns empty results");
  assert(
    exhausted.attempts.length === serpPlan.fullOrderedChain.length,
    "attemptedStrategies records every attempt"
  );

  let serpCalls = 0;
  await executeExtractionStrategyChain(
    {
      plan: serpPlan,
      supplierId: serpOnlyFacts.supplierId,
      query: "pipe",
      facts: serpOnlyFacts,
    },
    {
      executeStrategy: async (input) => {
        if (input.strategy === "SERP_SITE_ORGANIC") {
          serpCalls += 1;
          return { status: "success", results: [sampleResult] };
        }
        return { status: "unsupported", reason: "mock" };
      },
    }
  );
  assert(serpCalls === 1, "SERP success calls Serp once");

  const johnstoneFacts = baseFacts({
    supplierId: "johnstone_hsv",
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
  });
  const johnstonePlan = buildStrategyPlan({
    supplierId: johnstoneFacts.supplierId,
    facts: johnstoneFacts,
  });
  assert(
    johnstonePlan.fullOrderedChain[0] === "PLATFORM_API",
    "johnstone chain attempts PLATFORM_API first"
  );

  calls = 0;
  const platformSuccess = await executeExtractionStrategyChain(
    {
      plan: johnstonePlan,
      supplierId: johnstoneFacts.supplierId,
      query: "filter",
      facts: johnstoneFacts,
    },
    {
      executeStrategy: async (input) => {
        calls += 1;
        if (input.strategy === "PLATFORM_API") {
          return { status: "success", results: [sampleResult] };
        }
        return { status: "unsupported", reason: "mock" };
      },
    }
  );
  assert(
    platformSuccess.finalStrategyUsed === "PLATFORM_API",
    "johnstone platform success → finalStrategyUsed=PLATFORM_API"
  );
  assert(platformSuccess.fallbackDepth === 0, "platform success → fallbackDepth=0");
  assert(calls === 1, "platform success → one attempt only");

  const platformEmptyProfileSuccess = await executeExtractionStrategyChain(
    {
      plan: johnstonePlan,
      supplierId: johnstoneFacts.supplierId,
      query: "filter",
      facts: johnstoneFacts,
    },
    {
      executeStrategy: async (input) => {
        if (input.strategy === "PLATFORM_API") {
          return { status: "empty" };
        }
        if (input.strategy === "PROBABILISTIC_CATEGORY_PROFILE") {
          return { status: "success", results: [sampleResult] };
        }
        return { status: "unsupported", reason: "mock" };
      },
    }
  );
  assert(
    platformEmptyProfileSuccess.finalStrategyUsed === "PROBABILISTIC_CATEGORY_PROFILE",
    "PLATFORM_API empty falls through to profile"
  );
  assert(
    platformEmptyProfileSuccess.fallbackDepth > 0,
    "PLATFORM_API empty → profile success → fallbackDepth > 0"
  );

  const floorFacts = buildFactsFromLegacy({
    supplier: { id: "floor_decor_hsv", domain: "flooranddecor.com" },
  });
  const floorPlan = buildStrategyPlan({
    supplierId: floorFacts.supplierId,
    facts: floorFacts,
  });
  assert(
    floorPlan.fullOrderedChain[0] === "PUBLIC_API",
    "floor decor chain attempts PUBLIC_API first"
  );

  calls = 0;
  const publicSuccess = await executeExtractionStrategyChain(
    {
      plan: floorPlan,
      supplierId: floorFacts.supplierId,
      query: "tile",
      facts: floorFacts,
    },
    {
      executeStrategy: async (input) => {
        calls += 1;
        if (input.strategy === "PUBLIC_API") {
          return { status: "success", results: [sampleResult] };
        }
        return { status: "unsupported", reason: "mock" };
      },
    }
  );
  assert(
    publicSuccess.finalStrategyUsed === "PUBLIC_API",
    "floor decor public success → finalStrategyUsed=PUBLIC_API"
  );
  assert(publicSuccess.fallbackDepth === 0, "PUBLIC_API success → fallbackDepth=0");
  assert(calls === 1, "PUBLIC_API success → one attempt only");

  const publicEmptyProfileSuccess = await executeExtractionStrategyChain(
    {
      plan: floorPlan,
      supplierId: floorFacts.supplierId,
      query: "tile",
      facts: floorFacts,
    },
    {
      executeStrategy: async (input) => {
        if (input.strategy === "PUBLIC_API") {
          return { status: "empty" };
        }
        if (input.strategy === "PROBABILISTIC_CATEGORY_PROFILE") {
          return { status: "success", results: [sampleResult] };
        }
        return { status: "unsupported", reason: "mock" };
      },
    }
  );
  assert(
    publicEmptyProfileSuccess.finalStrategyUsed === "PROBABILISTIC_CATEGORY_PROFILE",
    "PUBLIC_API empty falls through to profile"
  );
  assert(
    publicEmptyProfileSuccess.fallbackDepth > 0,
    "PUBLIC_API empty → profile success → fallbackDepth > 0"
  );

  const schemaFacts = baseFacts({
    supplierId: "abc_supply_hsv",
    canonicalDomain: "abcsupply.com",
    hasSitemap: true,
    sitemapUrls: ["https://www.abcsupply.com/sitemap_products.xml"],
    legacySnapshot: {
      matchKind: "site_organic",
      mode: "site_organic",
      domain: "abcsupply.com",
    },
  });
  const schemaPlan = buildStrategyPlan({
    supplierId: schemaFacts.supplierId,
    facts: schemaFacts,
  });
  assert(
    schemaPlan.primaryStrategy === "SCHEMA_OR_SITEMAP",
    "ABC sitemap facts → SCHEMA_OR_SITEMAP primary"
  );

  let schemaChainCalls = 0;
  const schemaFallback = await executeExtractionStrategyChain(
    {
      plan: schemaPlan,
      supplierId: schemaFacts.supplierId,
      query: "GAF Timberline",
      dbDomain: "abcsupply.com",
      facts: schemaFacts,
    },
    {
      executeStrategy: async (input) => {
        schemaChainCalls += 1;
        if (input.strategy === "SCHEMA_OR_SITEMAP") {
          return {
            status: "empty",
            schemaSitemap: {
              candidateUrlsExamined: 4,
              productPagesFetched: 2,
              productPagesBlocked: 2,
            },
          };
        }
        if (input.strategy === "SERP_SITE_ORGANIC") {
          return { status: "success", results: [sampleResult] };
        }
        return { status: "unsupported", reason: "mock" };
      },
    }
  );
  assert(
    schemaFallback.finalStrategyUsed === "SERP_SITE_ORGANIC",
    "SCHEMA_OR_SITEMAP empty falls through to SERP"
  );
  assert(schemaFallback.fallbackDepth > 0, "SCHEMA empty → fallbackDepth > 0");
  assert(
    schemaFallback.attempts.some(
      (attempt) =>
        attempt.strategy === "SCHEMA_OR_SITEMAP" &&
        attempt.candidateUrlsExamined === 4 &&
        attempt.productPagesBlocked === 2
    ),
    "SCHEMA attempt records telemetry on empty"
  );
  assert(schemaChainCalls >= 2, "SCHEMA empty → chain continues");

  const htmlFacts = baseFacts({
    supplierId: "re_michel_hsv",
    canonicalDomain: "remichel.com",
    renderingType: "SERVER_RENDERED",
    antiBotRisk: "LOW",
    hasSitemap: false,
    legacySnapshot: {
      matchKind: "site_organic",
      mode: "site_organic",
      domain: "remichel.com",
    },
  });
  const htmlPlan = buildStrategyPlan({
    supplierId: htmlFacts.supplierId,
    facts: htmlFacts,
  });
  assert(
    htmlPlan.primaryStrategy === "HTML_SCRAPE",
    "re_michel facts → HTML_SCRAPE primary"
  );

  let htmlChainCalls = 0;
  const htmlFallback = await executeExtractionStrategyChain(
    {
      plan: htmlPlan,
      supplierId: htmlFacts.supplierId,
      query: "boiler",
      dbDomain: "remichel.com",
      facts: htmlFacts,
    },
    {
      executeStrategy: async (input) => {
        htmlChainCalls += 1;
        if (input.strategy === "HTML_SCRAPE") {
          return {
            status: "empty",
            htmlScrape: {
              candidateUrlsExamined: 4,
              pagesFetched: 2,
              pagesBlocked: 1,
              extractionSuccessCount: 0,
              latencyMs: 800,
              discoverySource: "serp",
              serpOrganicCount: 5,
              topUrlScore: 0.2,
            },
          };
        }
        if (input.strategy === "SERP_SITE_ORGANIC") {
          return { status: "success", results: [sampleResult] };
        }
        return { status: "unsupported", reason: "mock" };
      },
    }
  );
  assert(
    htmlFallback.finalStrategyUsed === "SERP_SITE_ORGANIC",
    "HTML_SCRAPE empty falls through to SERP"
  );
  assert(htmlFallback.fallbackDepth > 0, "HTML empty → fallbackDepth > 0");
  assert(
    htmlFallback.attempts.some(
      (attempt) =>
        attempt.strategy === "HTML_SCRAPE" &&
        attempt.candidateUrlsExamined === 4 &&
        attempt.pagesBlocked === 1 &&
        attempt.discoverySource === "serp"
    ),
    "HTML attempt records telemetry on empty"
  );
  assert(htmlChainCalls >= 2, "HTML empty → chain continues");

  console.log("\nAll executeExtractionStrategyChain tests passed.\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
