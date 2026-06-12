import { config } from "dotenv";
config({ path: ".env.local" });

import { buildSerpSiteOrganicParams } from "../buildSerpSiteOrganicParams";
import { executeExtractionStrategy } from "../executeExtractionStrategy";
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
    supplierId: "ferguson_wdc",
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
    legacySnapshot: { matchKind: "site_organic", mode: "site_organic", domain: "ferguson.com" },
    notes: null,
    ...overrides,
  };
}

const sampleResult: SupplierProductResult = {
  title: "Test Product",
  productUrl: "https://ferguson.com/p/1",
  supplierId: "ferguson_wdc",
  source: "FERGUSON",
};

console.log("\nexecuteExtractionStrategy tests\n");

const fergusonParams = buildSerpSiteOrganicParams(
  "ferguson_wdc",
  "copper pipe",
  "ferguson.com"
);
assert(fergusonParams?.domain === "ferguson.com", "ferguson prefix → site search params");
assert(fergusonParams?.source === "FERGUSON", "ferguson prefix uses registry source");

const genericParams = buildSerpSiteOrganicParams(
  "city_electric_hsv",
  "wire",
  "cityelectricsupply.com"
);
assert(genericParams?.source === "GENERIC", "generic domain → GENERIC source");

assert(
  buildSerpSiteOrganicParams("johnstone_atl", "filter", "johnstonesupply.com") === null,
  "platform prefix → no serp params"
);

async function runAsyncTests() {
  let serpCalls = 0;
  const mockSerp = async () => {
    serpCalls += 1;
    return [sampleResult];
  };

  const unsupported = await executeExtractionStrategy(
    {
      strategy: "PLATFORM_API",
      supplierId: "ferguson_wdc",
      query: "pipe",
      facts: baseFacts(),
    },
    { searchSupplierSiteFn: mockSerp }
  );
  assert(unsupported.status === "unsupported", "PLATFORM_API → unsupported when not ACCESSIBLE");
  assert(serpCalls === 0, "unsupported PLATFORM_API does not call Serp");

  const platformResult: SupplierProductResult = {
    title: "Johnstone Filter",
    productUrl: "https://www.johnstonesupply.com/p/filter",
    supplierId: "johnstone_hsv",
    source: "JOHNSTONE",
  };

  let platformCalls = 0;
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

  const platformSuccess = await executeExtractionStrategy(
    {
      strategy: "PLATFORM_API",
      supplierId: "johnstone_hsv",
      query: "filter",
      dbDomain: "johnstonesupply.com",
      facts: johnstoneFacts,
    },
    {
      executePlatformCatalogSearchFn: async () => {
        platformCalls += 1;
        return [platformResult];
      },
    }
  );
  assert(platformSuccess.status === "success", "PLATFORM_API success returns router results");
  assert(platformCalls === 1, "PLATFORM_API success calls executePlatformCatalogSearch once");
  assert(
    platformSuccess.status === "success" && platformSuccess.results[0]?.title === "Johnstone Filter",
    "PLATFORM_API success returns platform results"
  );

  const platformEmpty = await executeExtractionStrategy(
    {
      strategy: "PLATFORM_API",
      supplierId: "johnstone_hsv",
      query: "filter",
      dbDomain: "johnstonesupply.com",
      facts: johnstoneFacts,
    },
    {
      executePlatformCatalogSearchFn: async () => [],
    }
  );
  assert(platformEmpty.status === "empty", "PLATFORM_API empty → empty status");

  const platformError = await executeExtractionStrategy(
    {
      strategy: "PLATFORM_API",
      supplierId: "johnstone_hsv",
      query: "filter",
      dbDomain: "johnstonesupply.com",
      facts: johnstoneFacts,
    },
    {
      executePlatformCatalogSearchFn: async () => {
        throw new Error("platform down");
      },
    }
  );
  assert(platformError.status === "error", "PLATFORM_API throw → error status");

  const bindingIncomplete = await executeExtractionStrategy(
    {
      strategy: "PLATFORM_API",
      supplierId: "baker_atl",
      query: "pipe",
      dbDomain: "bakerdist.com",
      facts: baseFacts({
        supplierId: "baker_atl",
        canonicalDomain: "bakerdist.com",
        detectedPlatform: "BLOOMREACH",
        platformAccessStatus: "BINDING_INCOMPLETE",
        platformBindingValid: false,
        legacySnapshot: {
          matchKind: "registry_prefix",
          mode: "bloomreach",
          domain: "bakerdist.com",
        },
      }),
    },
    {
      executePlatformCatalogSearchFn: async () => {
        throw new Error("should not run");
      },
    }
  );
  assert(
    bindingIncomplete.status === "unsupported",
    "binding-incomplete supplier does not execute PLATFORM_API"
  );

  const floorFacts = buildFactsFromLegacy({
    supplier: { id: "floor_decor_hsv", domain: "flooranddecor.com" },
  });
  const publicResult: SupplierProductResult = {
    title: "Luxe Sand Matte Porcelain Tile",
    productUrl: "https://www.flooranddecor.com/porcelain-tile/luxe-sand-matte-porcelain-tile-101317733.html",
    supplierId: "floor_decor_hsv",
    source: "GENERIC",
    price: "2.99",
    imageUrl: "https://i8.amplience.net/i/flooranddecor/tile.jpg",
  };

  let publicCalls = 0;
  const publicSuccess = await executeExtractionStrategy(
    {
      strategy: "PUBLIC_API",
      supplierId: "floor_decor_hsv",
      query: "tile",
      dbDomain: "flooranddecor.com",
      facts: floorFacts,
    },
    {
      executePlatformCatalogSearchFn: async () => {
        publicCalls += 1;
        return [publicResult];
      },
    }
  );
  assert(publicSuccess.status === "success", "PUBLIC_API success returns router results");
  assert(publicCalls === 1, "PUBLIC_API success calls executePlatformCatalogSearch once");

  const publicEmpty = await executeExtractionStrategy(
    {
      strategy: "PUBLIC_API",
      supplierId: "floor_decor_hsv",
      query: "tile",
      dbDomain: "flooranddecor.com",
      facts: floorFacts,
    },
    {
      executePlatformCatalogSearchFn: async () => [],
    }
  );
  assert(publicEmpty.status === "empty", "PUBLIC_API empty → empty status");

  const publicError = await executeExtractionStrategy(
    {
      strategy: "PUBLIC_API",
      supplierId: "floor_decor_hsv",
      query: "tile",
      dbDomain: "flooranddecor.com",
      facts: floorFacts,
    },
    {
      executePlatformCatalogSearchFn: async () => {
        throw new Error("public api down");
      },
    }
  );
  assert(publicError.status === "error", "PUBLIC_API throw → error status");

  const ppgFacts = buildFactsFromLegacy({
    supplier: { id: "ppg_hsv", domain: "ppgpaints.com" },
    envKeyPresence: {},
  });
  const ppgBlocked = await executeExtractionStrategy(
    {
      strategy: "PUBLIC_API",
      supplierId: "ppg_hsv",
      query: "paint",
      dbDomain: "ppgpaints.com",
      facts: ppgFacts,
    },
    {
      executePlatformCatalogSearchFn: async () => {
        throw new Error("should not run");
      },
    }
  );
  assert(
    ppgBlocked.status === "unsupported",
    "PPG binding-incomplete does not execute PUBLIC_API"
  );

  const profileEmpty = await executeExtractionStrategy(
    {
      strategy: "PROBABILISTIC_CATEGORY_PROFILE",
      supplierId: "ferguson_wdc",
      query: "pipe",
      facts: baseFacts(),
    },
    {
      searchSupplierSiteFn: mockSerp,
      searchSupplierCapabilityProfileFn: async () => [],
    }
  );
  assert(profileEmpty.status === "empty", "PROFILE empty matches → empty status");
  assert(serpCalls === 0, "PROFILE does not call Serp");

  const profileMatch: import("@/lib/search/capabilitySearch").CapabilitySearchResult =
    {
      supplierId: "ferguson_wdc",
      categoryId: "plumbing",
      subcategory: "pipe",
      brand: "Mueller",
      productLine: "Copper Pipe",
      sourceUrl: "https://ferguson.com/cat",
      score: 12,
    };

  const profileSuccess = await executeExtractionStrategy(
    {
      strategy: "PROBABILISTIC_CATEGORY_PROFILE",
      supplierId: "ferguson_wdc",
      query: "pipe",
      facts: baseFacts(),
    },
    {
      searchSupplierSiteFn: mockSerp,
      searchSupplierCapabilityProfileFn: async () => [profileMatch],
    }
  );
  assert(profileSuccess.status === "success", "PROFILE → success when matches exist");
  assert(
    profileSuccess.status === "success" &&
      profileSuccess.results[0]?.title.startsWith("Likely carries:"),
    "PROFILE results use Likely carries title"
  );
  assert(
    profileSuccess.status === "success" &&
      profileSuccess.results[0]?.price === null,
    "PROFILE results have null price"
  );
  assert(
    profileSuccess.status === "success" &&
      profileSuccess.capabilityProfile?.capabilityMatchCount === 1,
    "PROFILE success includes capability telemetry metadata"
  );
  assert(serpCalls === 0, "PROFILE success does not call Serp");

  const success = await executeExtractionStrategy(
    {
      strategy: "SERP_SITE_ORGANIC",
      supplierId: "ferguson_wdc",
      query: "pipe",
      facts: baseFacts(),
    },
    { searchSupplierSiteFn: mockSerp }
  );
  assert(success.status === "success", "SERP_SITE_ORGANIC → success");
  assert(serpCalls === 1, "SERP_SITE_ORGANIC calls Serp once");

  const empty = await executeExtractionStrategy(
    {
      strategy: "SERP_SITE_ORGANIC",
      supplierId: "ferguson_wdc",
      query: "pipe",
      facts: baseFacts(),
    },
    { searchSupplierSiteFn: async () => [] }
  );
  assert(empty.status === "empty", "empty Serp results → empty status");

  const error = await executeExtractionStrategy(
    {
      strategy: "SERP_SITE_ORGANIC",
      supplierId: "ferguson_wdc",
      query: "pipe",
      facts: baseFacts(),
    },
    {
      searchSupplierSiteFn: async () => {
        throw new Error("serp down");
      },
    }
  );
  assert(error.status === "error", "Serp throw → error status");

  const abcSchemaFacts = baseFacts({
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

  const schemaResult: SupplierProductResult = {
    title: "GAF Timberline HDZ",
    productUrl: "https://www.abcsupply.com/product/timberline",
    supplierId: "abc_supply_hsv",
    source: "ABC_SUPPLY",
    price: null,
  };

  let schemaCalls = 0;
  const schemaSuccess = await executeExtractionStrategy(
    {
      strategy: "SCHEMA_OR_SITEMAP",
      supplierId: "abc_supply_hsv",
      query: "GAF Timberline",
      dbDomain: "abcsupply.com",
      facts: abcSchemaFacts,
    },
    {
      executeSchemaOrSitemapSearchFn: async () => {
        schemaCalls += 1;
        return {
          status: "success",
          results: [schemaResult],
          telemetry: {
            candidateUrlsExamined: 8,
            productPagesFetched: 3,
            productPagesBlocked: 1,
          },
        };
      },
    }
  );
  assert(schemaSuccess.status === "success", "SCHEMA_OR_SITEMAP success returns router results");
  assert(schemaCalls === 1, "SCHEMA_OR_SITEMAP success calls executor once");
  assert(
    schemaSuccess.status === "success" &&
      schemaSuccess.schemaSitemap?.candidateUrlsExamined === 8,
    "SCHEMA_OR_SITEMAP success includes telemetry"
  );

  const schemaEmpty = await executeExtractionStrategy(
    {
      strategy: "SCHEMA_OR_SITEMAP",
      supplierId: "abc_supply_hsv",
      query: "GAF Timberline",
      dbDomain: "abcsupply.com",
      facts: abcSchemaFacts,
    },
    {
      executeSchemaOrSitemapSearchFn: async () => ({
        status: "empty",
        telemetry: {
          candidateUrlsExamined: 5,
          productPagesFetched: 2,
          productPagesBlocked: 2,
        },
      }),
    }
  );
  assert(schemaEmpty.status === "empty", "SCHEMA_OR_SITEMAP empty → empty status");
  assert(
    schemaEmpty.status === "empty" &&
      schemaEmpty.schemaSitemap?.productPagesBlocked === 2,
    "SCHEMA_OR_SITEMAP empty includes telemetry"
  );

  const schemaUnsupported = await executeExtractionStrategy(
    {
      strategy: "SCHEMA_OR_SITEMAP",
      supplierId: "ferguson_wdc",
      query: "pipe",
      facts: baseFacts({ hasSitemap: true, sitemapUrls: ["https://x.com/s.xml"] }),
    },
    {
      executeSchemaOrSitemapSearchFn: async () => {
        throw new Error("should not run");
      },
    }
  );
  assert(
    schemaUnsupported.status === "unsupported",
    "non-allowlisted supplier does not execute SCHEMA_OR_SITEMAP"
  );

  const schemaIncomplete = await executeExtractionStrategy(
    {
      strategy: "SCHEMA_OR_SITEMAP",
      supplierId: "abc_supply_hsv",
      query: "pipe",
      facts: baseFacts({
        supplierId: "abc_supply_hsv",
        canonicalDomain: "abcsupply.com",
        hasSitemap: true,
        sitemapUrls: null,
        legacySnapshot: {
          matchKind: "site_organic",
          mode: "site_organic",
          domain: "abcsupply.com",
        },
      }),
    },
    {
      executeSchemaOrSitemapSearchFn: async () => {
        throw new Error("should not run");
      },
    }
  );
  assert(
    schemaIncomplete.status === "unsupported",
    "ABC with hasSitemap but missing sitemapUrls is unsupported"
  );

  const remichelFacts = baseFacts({
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

  const htmlResult: SupplierProductResult = {
    title: "Boiler Product",
    productUrl: "https://www.remichel.com/product/boiler",
    supplierId: "re_michel_hsv",
    source: "RE_MICHEL",
    price: null,
  };

  let htmlCalls = 0;
  const htmlSuccess = await executeExtractionStrategy(
    {
      strategy: "HTML_SCRAPE",
      supplierId: "re_michel_hsv",
      query: "boiler",
      dbDomain: "remichel.com",
      facts: remichelFacts,
    },
    {
      executeHtmlScrapeSearchFn: async () => {
        htmlCalls += 1;
        return {
          status: "success",
          results: [htmlResult],
          telemetry: {
            candidateUrlsExamined: 5,
            pagesFetched: 2,
            pagesBlocked: 0,
            extractionSuccessCount: 1,
            latencyMs: 1200,
            discoverySource: "serp",
            serpOrganicCount: 6,
            topUrlScore: 0.75,
          },
        };
      },
    }
  );
  assert(htmlSuccess.status === "success", "HTML_SCRAPE success returns router results");
  assert(htmlCalls === 1, "HTML_SCRAPE success calls executor once");
  assert(
    htmlSuccess.status === "success" &&
      htmlSuccess.htmlScrape?.candidateUrlsExamined === 5,
    "HTML_SCRAPE success includes telemetry"
  );

  const htmlEmpty = await executeExtractionStrategy(
    {
      strategy: "HTML_SCRAPE",
      supplierId: "re_michel_hsv",
      query: "boiler",
      dbDomain: "remichel.com",
      facts: remichelFacts,
    },
    {
      executeHtmlScrapeSearchFn: async () => ({
        status: "empty",
        telemetry: {
          candidateUrlsExamined: 3,
          pagesFetched: 2,
          pagesBlocked: 2,
          extractionSuccessCount: 0,
          latencyMs: 900,
          discoverySource: "serp",
          serpOrganicCount: 4,
          topUrlScore: 0.1,
        },
      }),
    }
  );
  assert(htmlEmpty.status === "empty", "HTML_SCRAPE empty → empty status");
  assert(
    htmlEmpty.status === "empty" && htmlEmpty.htmlScrape?.pagesBlocked === 2,
    "HTML_SCRAPE empty includes telemetry"
  );

  const htmlUnsupported = await executeExtractionStrategy(
    {
      strategy: "HTML_SCRAPE",
      supplierId: "ferguson_wdc",
      query: "pipe",
      facts: baseFacts(),
    },
    {
      executeHtmlScrapeSearchFn: async () => {
        throw new Error("should not run");
      },
    }
  );
  assert(
    htmlUnsupported.status === "unsupported",
    "non-allowlisted supplier does not execute HTML_SCRAPE"
  );

  const lowesResult: SupplierProductResult = {
    title: "DeWalt Drill",
    productUrl: "https://www.lowes.com/p/dewalt-drill",
    supplierId: "lowes_hsv",
    source: "LOWES",
    imageUrl: "https://images.lowes.com/drill.jpg",
    price: "$99.00",
  };

  let lowesCalls = 0;
  const productEngineLowes = await executeExtractionStrategy(
    {
      strategy: "SERP_PRODUCT_ENGINE",
      supplierId: "lowes_hsv",
      query: "drill",
      facts: baseFacts({
        supplierId: "lowes_hsv",
        canonicalDomain: "lowes.com",
        legacySnapshot: {
          matchKind: "registry_prefix",
          mode: "product_engine",
          domain: "lowes.com",
        },
      }),
    },
    {
      searchLowesFn: async () => {
        lowesCalls += 1;
        return [
          lowesResult,
          {
            ...lowesResult,
            supplierId: "lowes_south_hsv",
            title: "Other store drill",
          },
        ];
      },
    }
  );
  assert(
    productEngineLowes.status === "success",
    "SERP_PRODUCT_ENGINE Lowe's → success"
  );
  assert(lowesCalls === 1, "SERP_PRODUCT_ENGINE Lowe's calls searchLowes once");
  assert(
    productEngineLowes.status === "success" &&
      productEngineLowes.results.length === 1 &&
      productEngineLowes.results[0]?.supplierId === "lowes_hsv",
    "SERP_PRODUCT_ENGINE Lowe's filters to requested supplierId"
  );

  const hdResult: SupplierProductResult = {
    title: "Milwaukee Impact",
    productUrl: "https://www.homedepot.com/p/milwaukee-impact",
    supplierId: "home_depot_hsv",
    source: "HOME_DEPOT",
    imageUrl: "https://images.homedepot.com/impact.jpg",
    price: "$149.00",
  };

  let hdCalls = 0;
  const productEngineHd = await executeExtractionStrategy(
    {
      strategy: "SERP_PRODUCT_ENGINE",
      supplierId: "home_depot_hsv",
      query: "impact driver",
      facts: baseFacts({
        supplierId: "home_depot_hsv",
        canonicalDomain: "homedepot.com",
        legacySnapshot: {
          matchKind: "registry_prefix",
          mode: "product_engine",
          domain: "homedepot.com",
        },
      }),
    },
    {
      searchHomeDepotFn: async () => {
        hdCalls += 1;
        return [hdResult];
      },
    }
  );
  assert(
    productEngineHd.status === "success",
    "SERP_PRODUCT_ENGINE Home Depot → success"
  );
  assert(hdCalls === 1, "SERP_PRODUCT_ENGINE Home Depot calls searchHomeDepot once");

  const productEngineEmpty = await executeExtractionStrategy(
    {
      strategy: "SERP_PRODUCT_ENGINE",
      supplierId: "lowes_hsv",
      query: "drill",
      facts: baseFacts({ supplierId: "lowes_hsv" }),
    },
    {
      searchLowesFn: async () => [
        {
          ...lowesResult,
          imageUrl: null,
        },
      ],
    }
  );
  assert(
    productEngineEmpty.status === "empty",
    "SERP_PRODUCT_ENGINE drops imageless rows"
  );

  const productEngineUnsupported = await executeExtractionStrategy(
    {
      strategy: "SERP_PRODUCT_ENGINE",
      supplierId: "ferguson_wdc",
      query: "pipe",
      facts: baseFacts(),
    },
    {
      searchLowesFn: async () => {
        throw new Error("should not run");
      },
      searchHomeDepotFn: async () => {
        throw new Error("should not run");
      },
    }
  );
  assert(
    productEngineUnsupported.status === "unsupported",
    "unknown product-engine supplier returns unsupported"
  );
  assert(
    productEngineUnsupported.status === "unsupported" &&
      productEngineUnsupported.reason === "product_engine_not_configured",
    "unsupported product-engine reason is product_engine_not_configured"
  );

  console.log("\nAll executeExtractionStrategy tests passed.\n");
}

runAsyncTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
