import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { executeSchemaOrSitemapSearch } from "../executeSchemaOrSitemapSearch";
import type { SupplierFingerprintFacts } from "../../fingerprint/types";
import { resetSchemaSitemapFetchCacheForTests } from "../fetchSchemaSitemap.server";
import { resetDiscoveryUrlsCacheForTests } from "../discoveryUrlsCache.server";
import {
  pageMetadataCacheKey,
  resetPageMetadataCacheForTests,
} from "../pageMetadataCache.server";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
  console.log(`PASS: ${message}`);
}

const fixturesDir = join(
  __dirname,
  "../../fingerprint/__tests__/fixtures"
);
const htmlFixturesDir = join(__dirname, "fixtures");

function readFixture(name: string, dir = fixturesDir): string {
  return readFileSync(join(dir, name), "utf8");
}

function abcFacts(
  overrides: Partial<SupplierFingerprintFacts> = {}
): SupplierFingerprintFacts {
  return {
    supplierId: "abc_supply_hsv",
    canonicalDomain: "abcsupply.com",
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
    hasSitemap: true,
    sitemapUrls: [
      "https://www.example.com/sitemap_index.xml",
      "https://www.example.com/sitemap_products_1.xml",
    ],
    renderingType: "UNKNOWN",
    isSPA: null,
    antiBotRisk: "HIGH",
    demandPriority: "MEDIUM",
    demandScore: null,
    allowSerpFallback: true,
    fingerprintStatus: "SUCCESS",
    lastFingerprintedAt: null,
    legacySnapshot: {
      matchKind: "site_organic",
      mode: "site_organic",
      domain: "abcsupply.com",
    },
    notes: null,
    ...overrides,
  };
}

const sitemapIndex = readFixture("sitemap-index.xml");
const sitemapUrlset = readFixture("sitemap-urlset.xml");
const productHtml = readFixture("product-page-html.html", htmlFixturesDir);
const productJsonLd = readFixture("product-jsonld.html");
const cloudflareBlock = readFixture("cloudflare-block.html");

function mockFetch(responses: Record<string, { status: number; body: string }>) {
  return async (url: string) => {
    const entry = responses[url];
    if (!entry) {
      return { status: 404, text: async () => "" };
    }
    return { status: entry.status, text: async () => entry.body };
  };
}

function mockFetchWithGzip(
  responses: Record<
    string,
    { status: number; body: string | Buffer; gzip?: boolean }
  >
) {
  return async (url: string) => {
    const entry = responses[url];
    if (!entry) {
      return { status: 404, arrayBuffer: async () => new ArrayBuffer(0) };
    }
    const buf =
      entry.gzip === true
        ? gzipSync(Buffer.from(entry.body as string, "utf8"))
        : Buffer.isBuffer(entry.body)
          ? entry.body
          : Buffer.from(entry.body as string, "utf8");
    return {
      status: entry.status,
      arrayBuffer: async (): Promise<ArrayBuffer> => {
        const copy = Buffer.from(buf);
        return copy.buffer.slice(
          copy.byteOffset,
          copy.byteOffset + copy.byteLength
        ) as ArrayBuffer;
      },
    };
  };
}

console.log("\nexecuteSchemaOrSitemapSearch tests\n");

async function runTests() {
  resetSchemaSitemapFetchCacheForTests();
  resetDiscoveryUrlsCacheForTests();
  resetPageMetadataCacheForTests();

  const sitemapSuccess = await executeSchemaOrSitemapSearch(
    {
      supplierId: "abc_supply_hsv",
      query: "shingle",
      dbDomain: "abcsupply.com",
      facts: abcFacts(),
      source: "ABC_SUPPLY",
    },
    {
      useDiskCache: false,
      fetchFn: mockFetch({
        "https://www.example.com/sitemap_products_1.xml": {
          status: 200,
          body: sitemapUrlset,
        },
        "https://www.example.com/product/shingle-123": {
          status: 200,
          body: productHtml,
        },
      }),
    }
  );
  assert(sitemapSuccess.status === "success", "sitemap success");
  assert(
    sitemapSuccess.status === "success" &&
      sitemapSuccess.results[0]?.title.includes("Timberline"),
    "sitemap success returns product title"
  );
  assert(
    sitemapSuccess.status === "success" &&
      sitemapSuccess.results[0]?.price == null,
    "sitemap success does not fabricate price"
  );
  assert(
    sitemapSuccess.telemetry.candidateUrlsExamined > 0,
    "sitemap success telemetry candidateUrlsExamined"
  );

  resetSchemaSitemapFetchCacheForTests();
  resetPageMetadataCacheForTests();
  const schemaSuccess = await executeSchemaOrSitemapSearch(
    {
      supplierId: "abc_supply_hsv",
      query: "shingle",
      dbDomain: "abcsupply.com",
      facts: abcFacts({
        hasSchemaMarkup: true,
        sitemapUrls: ["https://www.example.com/sitemap_products_1.xml"],
      }),
      source: "ABC_SUPPLY",
    },
    {
      useDiskCache: false,
      fetchFn: mockFetch({
        "https://www.example.com/sitemap_products_1.xml": {
          status: 200,
          body: `<urlset><url><loc>https://www.example.com/product/shingle-123</loc></url></urlset>`,
        },
        "https://www.example.com/product/shingle-123": {
          status: 200,
          body: productJsonLd,
        },
      }),
    }
  );
  assert(schemaSuccess.status === "success", "schema success");
  assert(
    schemaSuccess.status === "success" &&
      schemaSuccess.results[0]?.title === "Architectural Shingle",
    "schema success uses JSON-LD title"
  );

  resetSchemaSitemapFetchCacheForTests();
  const sitemapEmpty = await executeSchemaOrSitemapSearch(
    {
      supplierId: "abc_supply_hsv",
      query: "zzzznonmatch",
      dbDomain: "abcsupply.com",
      facts: abcFacts(),
      source: "ABC_SUPPLY",
    },
    {
      useDiskCache: false,
      fetchFn: mockFetch({
        "https://www.example.com/sitemap_products_1.xml": {
          status: 200,
          body: sitemapUrlset,
        },
        "https://www.example.com/product/shingle-123": {
          status: 200,
          body: productHtml,
        },
      }),
    }
  );
  assert(sitemapEmpty.status === "empty", "sitemap empty on non-matching query");

  resetSchemaSitemapFetchCacheForTests();
  const schemaEmpty = await executeSchemaOrSitemapSearch(
    {
      supplierId: "abc_supply_hsv",
      query: "shingle",
      dbDomain: "abcsupply.com",
      facts: abcFacts({
        hasSchemaMarkup: true,
        sitemapUrls: [],
        hasSitemap: false,
      }),
      source: "ABC_SUPPLY",
    },
    {
      useDiskCache: false,
      fetchFn: mockFetch({}),
    }
  );
  assert(schemaEmpty.status === "empty", "schema empty without sitemap urls");

  resetSchemaSitemapFetchCacheForTests();
  resetDiscoveryUrlsCacheForTests();
  resetPageMetadataCacheForTests();
  const malformed = await executeSchemaOrSitemapSearch(
    {
      supplierId: "abc_supply_hsv",
      query: "shingle",
      dbDomain: "abcsupply.com",
      facts: abcFacts(),
      source: "ABC_SUPPLY",
    },
    {
      useDiskCache: false,
      fetchFn: mockFetch({
        "https://www.example.com/sitemap_products_1.xml": {
          status: 200,
          body: "<html>not xml</html>",
        },
      }),
    }
  );
  assert(malformed.status === "empty", "malformed sitemap returns empty");

  resetSchemaSitemapFetchCacheForTests();
  const fetchError = await executeSchemaOrSitemapSearch(
    {
      supplierId: "abc_supply_hsv",
      query: "shingle",
      dbDomain: "abcsupply.com",
      facts: abcFacts(),
      source: "ABC_SUPPLY",
    },
    {
      useDiskCache: false,
      fetchFn: async () => {
        throw new Error("network timeout");
      },
    }
  );
  assert(fetchError.status === "empty", "fetch errors return empty");

  resetSchemaSitemapFetchCacheForTests();
  const blocked = await executeSchemaOrSitemapSearch(
    {
      supplierId: "abc_supply_hsv",
      query: "shingle",
      dbDomain: "abcsupply.com",
      facts: abcFacts(),
      source: "ABC_SUPPLY",
    },
    {
      useDiskCache: false,
      fetchFn: mockFetch({
        "https://www.example.com/sitemap_products_1.xml": {
          status: 200,
          body: sitemapUrlset,
        },
        "https://www.example.com/product/shingle-123": {
          status: 200,
          body: cloudflareBlock,
        },
      }),
    }
  );
  assert(blocked.status === "empty", "blocked product pages return empty");
  assert(
    blocked.telemetry.productPagesBlocked >= 1,
    "blocked product pages increment productPagesBlocked"
  );

  resetSchemaSitemapFetchCacheForTests();
  const indexExpand = await executeSchemaOrSitemapSearch(
    {
      supplierId: "abc_supply_hsv",
      query: "shingle",
      dbDomain: "abcsupply.com",
      facts: abcFacts({
        sitemapUrls: ["https://www.example.com/sitemap_index.xml"],
      }),
      source: "ABC_SUPPLY",
    },
    {
      useDiskCache: false,
      fetchFn: mockFetch({
        "https://www.example.com/sitemap_index.xml": {
          status: 200,
          body: sitemapIndex,
        },
        "https://www.example.com/sitemap_products_1.xml": {
          status: 200,
          body: sitemapUrlset,
        },
        "https://www.example.com/product/shingle-123": {
          status: 200,
          body: productHtml,
        },
      }),
    }
  );
  assert(indexExpand.status === "success", "sitemap index expansion success");

  resetSchemaSitemapFetchCacheForTests();
  const gzipChildUrl =
    "https://www.wittichen-supply.com/sitemap/products.xml.gz";
  const gzipUrlset = `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
    <url><loc>https://www.wittichen-supply.com/products/residential-equipment/</loc></url>
    <url><loc>https://www.wittichen-supply.com/resources/contractor-tools/jobsite-furnace-form/</loc></url>
  </urlset>`;
  const gzipIndex = `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
    <sitemap><loc>${gzipChildUrl}</loc></sitemap>
  </sitemapindex>`;
  const categoryHtml = `<html><head><title>Residential Equipment | Wittichen Supply</title></head><body></body></html>`;

  const gzipSuccess = await executeSchemaOrSitemapSearch(
    {
      supplierId: "wittichen_hsv",
      query: "furnace",
      dbDomain: "wittichen-supply.com",
      facts: abcFacts({
        supplierId: "wittichen_hsv",
        canonicalDomain: "wittichen-supply.com",
        hasSchemaMarkup: false,
        sitemapUrls: [
          "https://www.wittichen-supply.com/sitemap.xml",
          gzipChildUrl,
        ],
      }),
      source: "WITTICHEN",
    },
    {
      useDiskCache: false,
      fetchFn: mockFetchWithGzip({
        "https://www.wittichen-supply.com/sitemap.xml": {
          status: 200,
          body: gzipIndex,
        },
        [gzipChildUrl]: {
          status: 200,
          body: gzipUrlset,
          gzip: true,
        },
        "https://www.wittichen-supply.com/products/residential-equipment/": {
          status: 200,
          body: categoryHtml,
        },
      }),
    }
  );
  assert(gzipSuccess.status === "success", "gzip child sitemap success");
  if (gzipSuccess.status !== "success") {
    process.exit(1);
  }
  assert(
    gzipSuccess.results[0]?.title.includes("Residential Equipment"),
    "gzip sitemap browse ranks category page"
  );
  assert(
    (gzipSuccess.results[0]?.productUrl ?? "").includes("residential-equipment"),
    "gzip sitemap returns category productUrl"
  );

  resetSchemaSitemapFetchCacheForTests();
  const gzipMalformed = await executeSchemaOrSitemapSearch(
    {
      supplierId: "wittichen_hsv",
      query: "furnace",
      dbDomain: "wittichen-supply.com",
      facts: abcFacts({
        supplierId: "wittichen_hsv",
        sitemapUrls: [gzipChildUrl],
      }),
      source: "WITTICHEN",
    },
    {
      useDiskCache: false,
      fetchFn: mockFetchWithGzip({
        [gzipChildUrl]: {
          status: 200,
          body: "not-valid-gzip",
          gzip: false,
        },
      }),
    }
  );
  assert(gzipMalformed.status === "empty", "malformed gzip child returns empty");

  resetSchemaSitemapFetchCacheForTests();
  resetDiscoveryUrlsCacheForTests();
  let sitemapFetchCalls = 0;
  const cacheMissFetch = mockFetch({
    "https://www.example.com/sitemap_products_1.xml": {
      status: 200,
      body: sitemapUrlset,
    },
    "https://www.example.com/product/shingle-123": {
      status: 200,
      body: productHtml,
    },
  });
  const countingFetch = async (url: string) => {
    if (url.includes("sitemap")) sitemapFetchCalls += 1;
    return cacheMissFetch(url);
  };

  const cacheMiss = await executeSchemaOrSitemapSearch(
    {
      supplierId: "abc_supply_hsv",
      query: "shingle",
      dbDomain: "abcsupply.com",
      facts: abcFacts(),
      source: "ABC_SUPPLY",
    },
    {
      useDiskCache: false,
      fetchFn: countingFetch,
    }
  );
  assert(cacheMiss.status === "success", "discovery cache miss succeeds");
  assert(
    cacheMiss.telemetry.discoveryUrlCacheHit === false,
    "discovery cache miss sets discoveryUrlCacheHit=false"
  );
  assert(
    (cacheMiss.telemetry.sitemapFetchCount ?? 0) >= 1,
    "discovery cache miss fetches sitemap"
  );
  assert(sitemapFetchCalls >= 1, "discovery cache miss invokes sitemap fetch");

  resetSchemaSitemapFetchCacheForTests();
  sitemapFetchCalls = 0;
  const cacheHit = await executeSchemaOrSitemapSearch(
    {
      supplierId: "abc_supply_hsv",
      query: "shingle",
      dbDomain: "abcsupply.com",
      facts: abcFacts(),
      source: "ABC_SUPPLY",
    },
    {
      useDiskCache: false,
      fetchFn: countingFetch,
    }
  );
  assert(cacheHit.status === "success", "discovery cache hit succeeds");
  assert(
    cacheHit.telemetry.discoveryUrlCacheHit === true,
    "discovery cache hit sets discoveryUrlCacheHit=true"
  );
  assert(
    cacheHit.telemetry.sitemapFetchCount === 0,
    "discovery cache hit skips sitemap fetch count"
  );
  assert(sitemapFetchCalls === 0, "discovery cache hit skips sitemap fetch calls");
  assert(
    cacheHit.telemetry.discoveryUrlCount === cacheMiss.telemetry.discoveryUrlCount,
    "discovery cache hit preserves discoveryUrlCount"
  );
  assert(
    cacheHit.status === "success" &&
      cacheMiss.status === "success" &&
      cacheHit.results[0]?.title === cacheMiss.results[0]?.title,
    "discovery cache hit returns identical result mapping"
  );
  assert(
    typeof cacheHit.telemetry.urlRankingLatencyMs === "number",
    "discovery cache hit records urlRankingLatencyMs"
  );

  resetSchemaSitemapFetchCacheForTests();
  resetDiscoveryUrlsCacheForTests();
  resetPageMetadataCacheForTests();
  const threeUrlSitemap = `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
    <url><loc>https://www.example.com/product/shingle-123</loc></url>
    <url><loc>https://www.example.com/product/shingle-456</loc></url>
    <url><loc>https://www.example.com/product/shingle-789</loc></url>
  </urlset>`;
  let productPageFetches = 0;
  const sequentialFetch = mockFetch({
    "https://www.example.com/sitemap_products_1.xml": {
      status: 200,
      body: threeUrlSitemap,
    },
    "https://www.example.com/product/shingle-123": {
      status: 200,
      body: productHtml,
    },
    "https://www.example.com/product/shingle-456": {
      status: 200,
      body: productHtml,
    },
    "https://www.example.com/product/shingle-789": {
      status: 200,
      body: productHtml,
    },
  });
  const countingProductFetch = async (url: string) => {
    if (url.includes("/product/shingle-")) productPageFetches += 1;
    return sequentialFetch(url);
  };

  const sequentialSuccess = await executeSchemaOrSitemapSearch(
    {
      supplierId: "abc_supply_hsv",
      query: "shingle",
      dbDomain: "abcsupply.com",
      facts: abcFacts(),
      source: "ABC_SUPPLY",
    },
    {
      useDiskCache: false,
      fetchFn: countingProductFetch,
    }
  );
  assert(sequentialSuccess.status === "success", "sequential top-ranked success");
  assert(
    productPageFetches === 1,
    "sequential top-ranked success fetches only first page"
  );
  assert(
    sequentialSuccess.telemetry.earlyExitAfterPages === 1,
    "sequential top-ranked sets earlyExitAfterPages=1"
  );

  resetSchemaSitemapFetchCacheForTests();
  resetDiscoveryUrlsCacheForTests();
  resetPageMetadataCacheForTests();
  productPageFetches = 0;
  const blockedHtml = readFixture("cloudflare-block.html");
  const sequentialFallback = await executeSchemaOrSitemapSearch(
    {
      supplierId: "abc_supply_hsv",
      query: "shingle",
      dbDomain: "abcsupply.com",
      facts: abcFacts(),
      source: "ABC_SUPPLY",
    },
    {
      useDiskCache: false,
      fetchFn: mockFetch({
        "https://www.example.com/sitemap_products_1.xml": {
          status: 200,
          body: threeUrlSitemap,
        },
        "https://www.example.com/product/shingle-123": {
          status: 200,
          body: blockedHtml,
        },
        "https://www.example.com/product/shingle-456": {
          status: 200,
          body: productHtml,
        },
      }),
    }
  );
  assert(
    sequentialFallback.status === "success",
    "sequential first page blocked continues to next batch"
  );
  assert(
    (sequentialFallback.telemetry.productPagesFetched ?? 0) >= 2,
    "sequential fallback fetches more than first page"
  );

  resetSchemaSitemapFetchCacheForTests();
  resetDiscoveryUrlsCacheForTests();
  resetPageMetadataCacheForTests();
  let metadataFetchCalls = 0;
  const metadataFetch = mockFetch({
    "https://www.example.com/sitemap_products_1.xml": {
      status: 200,
      body: sitemapUrlset,
    },
    "https://www.example.com/product/shingle-123": {
      status: 200,
      body: productHtml,
    },
  });
  const countingMetadataFetch = async (url: string) => {
    if (url.includes("/product/")) metadataFetchCalls += 1;
    return metadataFetch(url);
  };

  const metadataMiss = await executeSchemaOrSitemapSearch(
    {
      supplierId: "abc_supply_hsv",
      query: "shingle",
      dbDomain: "abcsupply.com",
      facts: abcFacts(),
      source: "ABC_SUPPLY",
    },
    {
      useDiskCache: false,
      fetchFn: countingMetadataFetch,
    }
  );
  assert(metadataMiss.status === "success", "metadata cache miss succeeds");
  assert(
    (metadataMiss.telemetry.metadataCacheMiss ?? 0) >= 1,
    "metadata cache miss increments metadataCacheMiss"
  );
  assert(metadataFetchCalls >= 1, "metadata cache miss fetches product page");

  resetSchemaSitemapFetchCacheForTests();
  metadataFetchCalls = 0;
  const metadataHit = await executeSchemaOrSitemapSearch(
    {
      supplierId: "abc_supply_hsv",
      query: "shingle",
      dbDomain: "abcsupply.com",
      facts: abcFacts(),
      source: "ABC_SUPPLY",
    },
    {
      useDiskCache: false,
      fetchFn: countingMetadataFetch,
    }
  );
  assert(metadataHit.status === "success", "metadata cache hit succeeds");
  assert(
    (metadataHit.telemetry.metadataCacheHit ?? 0) >= 1,
    "metadata cache hit increments metadataCacheHit"
  );
  assert(metadataFetchCalls === 0, "metadata cache hit skips product page fetch");
  assert(
    metadataHit.status === "success" &&
      metadataMiss.status === "success" &&
      metadataHit.results[0]?.title === metadataMiss.results[0]?.title,
    "metadata cache hit returns identical result mapping"
  );
  assert(
    (metadataHit.telemetry.productPagesFetched ?? 0) <
      (metadataMiss.telemetry.productPagesFetched ?? 0),
    "metadata cache hit reduces productPagesFetched on repeat query"
  );

  resetSchemaSitemapFetchCacheForTests();
  resetPageMetadataCacheForTests();
  const badKey = pageMetadataCacheKey(
    "https://www.example.com/product/shingle-123"
  );
  const metadataCacheDir = join(
    process.cwd(),
    "scripts",
    "cache",
    "schema-page-metadata"
  );
  mkdirSync(metadataCacheDir, { recursive: true });
  writeFileSync(
    join(metadataCacheDir, `${badKey}.json`),
    JSON.stringify({ bad: true }),
    "utf8"
  );
  metadataFetchCalls = 0;
  const malformedMetadata = await executeSchemaOrSitemapSearch(
    {
      supplierId: "abc_supply_hsv",
      query: "shingle",
      dbDomain: "abcsupply.com",
      facts: abcFacts(),
      source: "ABC_SUPPLY",
    },
    {
      useDiskCache: false,
      fetchFn: countingMetadataFetch,
    }
  );
  assert(
    malformedMetadata.status === "success",
    "malformed metadata cache falls back to fetch"
  );
  assert(metadataFetchCalls >= 1, "malformed metadata cache triggers fetch");
  try {
    rmSync(join(metadataCacheDir, `${badKey}.json`), { force: true });
  } catch {
    /* cleanup */
  }

  console.log("\nAll executeSchemaOrSitemapSearch tests passed.\n");
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
