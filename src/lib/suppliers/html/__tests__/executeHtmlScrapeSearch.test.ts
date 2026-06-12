import { readFileSync } from "node:fs";
import { join } from "node:path";
import { executeHtmlScrapeSearch } from "../executeHtmlScrapeSearch";
import type { SupplierFingerprintFacts } from "../../fingerprint/types";
import { resetHtmlScrapeFetchCacheForTests } from "../fetchHtmlScrape.server";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
  console.log(`PASS: ${message}`);
}

const htmlFixturesDir = join(__dirname, "../../schema/__tests__/fixtures");
const fingerprintFixturesDir = join(
  __dirname,
  "../../fingerprint/__tests__/fixtures"
);

function readFixture(name: string, dir = htmlFixturesDir): string {
  return readFileSync(join(dir, name), "utf8");
}

function remichelFacts(
  overrides: Partial<SupplierFingerprintFacts> = {}
): SupplierFingerprintFacts {
  return {
    supplierId: "re_michel_hsv",
    canonicalDomain: "remichel.com",
    detectedPlatform: "UNKNOWN",
    platformDetectionConfidence: 1,
    platformDetectionSource: "legacy_config",
    platformAccessStatus: "NOT_APPLICABLE",
    platformBindingId: null,
    platformBindingValid: false,
    hasPublicApi: null,
    publicApiAccessStatus: "NOT_PROBED",
    publicApiEndpoint: null,
    hasSchemaMarkup: false,
    hasSitemap: false,
    sitemapUrls: null,
    renderingType: "SERVER_RENDERED",
    isSPA: false,
    antiBotRisk: "LOW",
    demandPriority: "LOW",
    demandScore: null,
    allowSerpFallback: true,
    fingerprintStatus: "SUCCESS",
    lastFingerprintedAt: null,
    legacySnapshot: {
      matchKind: "site_organic",
      mode: "site_organic",
      domain: "remichel.com",
    },
    notes: null,
    ...overrides,
  };
}

const productHtml = readFixture("product-page-html.html");
const cloudflareBlock = readFixture("cloudflare-block.html", fingerprintFixturesDir);

function mockFetch(responses: Record<string, { status: number; body: string }>) {
  return async (url: string) => {
    const entry = responses[url];
    if (!entry) {
      return { status: 404, text: async () => "" };
    }
    return { status: entry.status, text: async () => entry.body };
  };
}

function mockSerp(links: string[]) {
  return async () =>
    ({
      ok: true,
      json: async () => ({
        organic_results: links.map((link) => ({ link, title: "Serp title" })),
      }),
    }) as Response;
}

console.log("\nexecuteHtmlScrapeSearch tests\n");

async function runTests() {
  resetHtmlScrapeFetchCacheForTests();

  const success = await executeHtmlScrapeSearch(
    {
      supplierId: "re_michel_hsv",
      query: "boiler",
      dbDomain: "remichel.com",
      facts: remichelFacts(),
      source: "RE_MICHEL",
    },
    {
      useDiskCache: false,
      getApiKey: () => "test-key",
      serpFetchFn: mockSerp([
        "https://www.remichel.com/product/boiler-123",
        "https://www.remichel.com/category/boilers",
      ]),
      fetchFn: mockFetch({
        "https://www.remichel.com/product/boiler-123": {
          status: 200,
          body: productHtml,
        },
      }),
    }
  );
  assert(success.status === "success", "html scrape success");
  assert(
    success.status === "success" &&
      success.results[0]?.title.includes("Timberline"),
    "html scrape returns extracted page title"
  );
  assert(
    success.status === "success" && success.results[0]?.price == null,
    "html scrape does not fabricate price"
  );
  assert(
    success.telemetry.candidateUrlsExamined > 0,
    "html scrape telemetry candidateUrlsExamined"
  );
  assert(
    success.telemetry.pagesFetched >= 1,
    "html scrape telemetry pagesFetched"
  );
  assert(
    success.telemetry.extractionSuccessCount >= 1,
    "html scrape telemetry extractionSuccessCount"
  );
  assert(
    success.telemetry.discoverySource === "serp",
    "html scrape discoverySource is serp"
  );
  assert(
    success.telemetry.serpOrganicCount === 2,
    "html scrape serpOrganicCount"
  );

  resetHtmlScrapeFetchCacheForTests();
  const empty = await executeHtmlScrapeSearch(
    {
      supplierId: "re_michel_hsv",
      query: "zzzznonmatch",
      dbDomain: "remichel.com",
      facts: remichelFacts(),
      source: "RE_MICHEL",
    },
    {
      useDiskCache: false,
      getApiKey: () => "test-key",
      serpFetchFn: mockSerp(["https://www.remichel.com/product/boiler-123"]),
      fetchFn: mockFetch({
        "https://www.remichel.com/product/boiler-123": {
          status: 200,
          body: productHtml,
        },
      }),
    }
  );
  assert(empty.status === "empty", "non-matching query returns empty");
  assert(
    empty.telemetry.extractionSuccessCount === 0,
    "empty result has zero extractionSuccessCount"
  );

  resetHtmlScrapeFetchCacheForTests();
  const blocked = await executeHtmlScrapeSearch(
    {
      supplierId: "re_michel_hsv",
      query: "boiler",
      dbDomain: "remichel.com",
      facts: remichelFacts(),
      source: "RE_MICHEL",
    },
    {
      useDiskCache: false,
      getApiKey: () => "test-key",
      serpFetchFn: mockSerp(["https://www.remichel.com/product/boiler-123"]),
      fetchFn: mockFetch({
        "https://www.remichel.com/product/boiler-123": {
          status: 200,
          body: cloudflareBlock,
        },
      }),
    }
  );
  assert(blocked.status === "empty", "blocked pages return empty");
  assert(
    blocked.telemetry.pagesBlocked >= 1,
    "blocked pages increment pagesBlocked"
  );

  resetHtmlScrapeFetchCacheForTests();
  const noSerp = await executeHtmlScrapeSearch(
    {
      supplierId: "re_michel_hsv",
      query: "boiler",
      dbDomain: "remichel.com",
      facts: remichelFacts(),
      source: "RE_MICHEL",
    },
    {
      useDiskCache: false,
      getApiKey: () => undefined,
      fetchFn: mockFetch({}),
    }
  );
  assert(noSerp.status === "empty", "missing serp key returns empty");
  assert(
    noSerp.telemetry.serpOrganicCount === 0,
    "missing serp key has zero serpOrganicCount"
  );

  resetHtmlScrapeFetchCacheForTests();
  const homepageFallback = await executeHtmlScrapeSearch(
    {
      supplierId: "wittichen_hsv",
      query: "hvac parts",
      dbDomain: "wittichen-supply.com",
      facts: remichelFacts({
        supplierId: "wittichen_hsv",
        canonicalDomain: "wittichen-supply.com",
        legacySnapshot: {
          matchKind: "site_organic",
          mode: "site_organic",
          domain: "wittichen-supply.com",
        },
      }),
      source: "WITTICHEN",
    },
    {
      useDiskCache: false,
      getApiKey: () => undefined,
      fetchFn: mockFetch({
        "https://www.wittichen-supply.com": {
          status: 200,
          body: `<html><head><title>Wittichen</title></head><body>
            <a href="/products/hvac-parts/">HVAC Parts</a>
            <a href="/products/residential-equipment/">Residential</a>
            </body></html>`,
        },
        "https://www.wittichen-supply.com/products/hvac-parts/": {
          status: 200,
          body: `<html><head><title>HVAC Parts | Wittichen Supply</title>
            <meta property="og:title" content="HVAC Parts | Wittichen Supply" /></head>
            <body><h1>HVAC Parts</h1><div class="g-recaptcha"></div>
            ${"<p>parts catalog</p>".repeat(50)}</body></html>`,
        },
      }),
    }
  );
  assert(homepageFallback.status === "success", "homepage discovery fallback success");
  assert(
    homepageFallback.status === "success" &&
      homepageFallback.results[0]?.title.includes("HVAC Parts"),
    "homepage fallback extracts page title"
  );
  assert(
    homepageFallback.telemetry.discoverySource === "homepage",
    "homepage-only discoverySource"
  );
  assert(
    homepageFallback.telemetry.pagesFetched >= 1,
    "homepage fallback fetches product page"
  );

  resetHtmlScrapeFetchCacheForTests();
  const furnaceBrowse = await executeHtmlScrapeSearch(
    {
      supplierId: "wittichen_hsv",
      query: "furnace",
      dbDomain: "wittichen-supply.com",
      facts: remichelFacts({
        supplierId: "wittichen_hsv",
        canonicalDomain: "wittichen-supply.com",
        legacySnapshot: {
          matchKind: "site_organic",
          mode: "site_organic",
          domain: "wittichen-supply.com",
        },
      }),
      source: "WITTICHEN",
    },
    {
      useDiskCache: false,
      getApiKey: () => undefined,
      fetchFn: mockFetch({
        "https://www.wittichen-supply.com": {
          status: 200,
          body: `<html><body>
            <a href="/products/residential-equipment/">Residential Equipment</a>
            </body></html>`,
        },
        "https://www.wittichen-supply.com/products/residential-equipment/": {
          status: 200,
          body: `<html><head><title>Residential Equipment | Wittichen Supply</title>
            <meta property="og:title" content="Residential Equipment | Wittichen Supply" /></head>
            <body><h1>Residential Equipment</h1></body></html>`,
        },
      }),
    }
  );
  assert(furnaceBrowse.status === "success", "furnace browse alias success");
  assert(
    furnaceBrowse.telemetry.aliasSourceProductType === "furnace",
    "furnace telemetry aliasSourceProductType"
  );
  assert(
    furnaceBrowse.telemetry.aliasMatchType === "path_alias",
    "furnace telemetry aliasMatchType"
  );

  resetHtmlScrapeFetchCacheForTests();
  const thermostatExpansion = await executeHtmlScrapeSearch(
    {
      supplierId: "wittichen_hsv",
      query: "thermostat",
      dbDomain: "wittichen-supply.com",
      facts: remichelFacts({
        supplierId: "wittichen_hsv",
        canonicalDomain: "wittichen-supply.com",
        legacySnapshot: {
          matchKind: "site_organic",
          mode: "site_organic",
          domain: "wittichen-supply.com",
        },
      }),
      source: "WITTICHEN",
    },
    {
      useDiskCache: false,
      getApiKey: () => undefined,
      fetchFn: mockFetch({
        "https://www.wittichen-supply.com": {
          status: 200,
          body: `<html><body>
            <a href="/products/hvac-parts/">HVAC Parts</a>
            </body></html>`,
        },
        "https://www.wittichen-supply.com/products/hvac-parts/": {
          status: 200,
          body: `<html><body>
            <a href="/products/hvac-parts/thermostats/">Thermostats</a>
            </body></html>`,
        },
        "https://www.wittichen-supply.com/products/hvac-parts/thermostats/": {
          status: 200,
          body: `<html><head><title>Thermostats | Wittichen Supply</title>
            <meta property="og:title" content="Thermostats | Wittichen Supply" /></head>
            <body><h1>Thermostats</h1></body></html>`,
        },
      }),
    }
  );
  assert(
    thermostatExpansion.status === "success",
    "thermostat one-hop subcategory expansion success"
  );
  assert(
    (thermostatExpansion.telemetry.subcategoryUrlsDiscovered ?? 0) >= 1,
    "thermostat telemetry subcategoryUrlsDiscovered"
  );
  assert(
    thermostatExpansion.telemetry.aliasMatchType === "subcategory_expansion",
    "thermostat telemetry aliasMatchType subcategory_expansion"
  );

  console.log("\nAll executeHtmlScrapeSearch tests passed.\n");
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
