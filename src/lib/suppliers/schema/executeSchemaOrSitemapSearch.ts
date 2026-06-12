import type { AntiBotRisk } from "@prisma/client";
import type { SupplierFingerprintFacts } from "../fingerprint/types";
import type {
  AntiBotCategory,
  BlockedUrlClass,
} from "../fingerprint/classifyAntiBotResponse";
import { classifyAntiBotResponse } from "../fingerprint/classifyAntiBotResponse";
import { resolveSupplierProductSource } from "../capability/resolveSupplierProductSource";
import type { SupplierProductResult, SupplierProductSource } from "../types";
import { classifyUrl } from "@/lib/search/classification/classifyUrl";
import {
  extractProductFromHtml,
  type ExtractedProductMetadata,
} from "./extractProductMetadata";
import {
  loadPageMetadataCache,
  writePageMetadataCache,
  type PageMetadataCacheDeps,
} from "./pageMetadataCache.server";
import {
  fetchSchemaSitemapUrl,
  SchemaSitemapRequestBudget,
  type SchemaSitemapFetchDeps,
} from "./fetchSchemaSitemap.server";
import {
  loadDiscoveryUrlsCache,
  writeDiscoveryUrlsCache,
  type DiscoveryUrlsCacheDeps,
} from "./discoveryUrlsCache.server";
import {
  DEFAULT_RANKED_URL_LIMIT,
  meetsBrowseRelevance,
  rankBrowseUrlsByQuery,
  type RankedBrowseUrl,
} from "./rankBrowseUrlsByQuery";
import {
  isProductDiscoveryUrl,
  isSitemapIndex,
  normalizeStoredSitemapUrls,
  orderSitemapFetchCandidates,
  parseSitemapLocUrls,
} from "./sitemapParse";

export const SCHEMA_SITEMAP_MAX_REQUESTS = 12;
export const SCHEMA_SITEMAP_MAX_SITEMAP_FETCHES = 2;
export const SCHEMA_SITEMAP_MAX_PRODUCT_PAGES = 6;
export const SCHEMA_SITEMAP_MAX_RESULTS = 6;
export const SCHEMA_SITEMAP_PRODUCT_FETCH_CONCURRENCY = 3;
export const SCHEMA_SITEMAP_LOC_PARSE_LIMIT = 500;

export type SchemaSitemapExecutionTelemetry = {
  candidateUrlsExamined: number;
  productPagesFetched: number;
  productPagesBlocked: number;
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
  antiBotRisk?: AntiBotRisk;
  antiBotCategory?: AntiBotCategory;
  blockedUrlClass?: BlockedUrlClass;
};

export type ExecuteSchemaOrSitemapSearchInput = {
  supplierId: string;
  query: string;
  dbDomain?: string | null;
  facts: SupplierFingerprintFacts;
  source?: SupplierProductSource;
};

export type ExecuteSchemaOrSitemapSearchResult =
  | {
      status: "success";
      results: SupplierProductResult[];
      telemetry: SchemaSitemapExecutionTelemetry;
    }
  | {
      status: "empty";
      telemetry: SchemaSitemapExecutionTelemetry;
    };

export type ExecuteSchemaOrSitemapSearchDeps = SchemaSitemapFetchDeps &
  DiscoveryUrlsCacheDeps &
  PageMetadataCacheDeps;

type SitemapCollectionResult = {
  urls: string[];
  sitemapFetchCount: number;
  sitemapParseLatencyMs: number;
  sitemapDecompressLatencyMs: number;
};

function emptyTelemetry(
  overrides: Partial<SchemaSitemapExecutionTelemetry> = {}
): SchemaSitemapExecutionTelemetry {
  return {
    candidateUrlsExamined: 0,
    productPagesFetched: 0,
    productPagesBlocked: 0,
    ...overrides,
  };
}

function recordBlockedProductFetch(
  telemetry: SchemaSitemapExecutionTelemetry,
  response: { status: number | null; html: string; url: string }
): void {
  telemetry.productPagesBlocked += 1;
  const classification = classifyAntiBotResponse({
    status: response.status,
    html: response.html,
    url: response.url,
  });
  telemetry.antiBotRisk = classification.antiBotRisk;
  telemetry.antiBotCategory = classification.antiBotCategory;
  telemetry.blockedUrlClass = classification.blockedUrlClass;
}

async function collectPageUrlsFromStoredSitemaps(
  storedUrls: string[],
  budget: SchemaSitemapRequestBudget,
  deps?: SchemaSitemapFetchDeps
): Promise<SitemapCollectionResult> {
  const empty: SitemapCollectionResult = {
    urls: [],
    sitemapFetchCount: 0,
    sitemapParseLatencyMs: 0,
    sitemapDecompressLatencyMs: 0,
  };
  const candidates = orderSitemapFetchCandidates(storedUrls).slice(
    0,
    SCHEMA_SITEMAP_MAX_SITEMAP_FETCHES
  );

  let sitemapFetchCount = 0;
  let sitemapDecompressLatencyMs = 0;

  for (const sitemapUrl of candidates) {
    if (!budget.consume()) break;

    const res = await fetchSchemaSitemapUrl(sitemapUrl, deps);
    sitemapFetchCount += 1;
    sitemapDecompressLatencyMs += res.decompressLatencyMs ?? 0;
    if (res.status !== 200 || !res.html.includes("<loc>")) continue;

    if (isSitemapIndex(res.html)) {
      const childSitemaps = orderSitemapFetchCandidates(
        parseSitemapLocUrls(res.html, 50)
      );
      for (const childUrl of childSitemaps) {
        if (!budget.canFetch() || !budget.consume()) break;
        const childRes = await fetchSchemaSitemapUrl(childUrl, deps);
        sitemapFetchCount += 1;
        sitemapDecompressLatencyMs += childRes.decompressLatencyMs ?? 0;
        if (childRes.status !== 200 || !childRes.html.includes("<loc>")) {
          continue;
        }
        const parseStart = Date.now();
        const urls = parseSitemapLocUrls(
          childRes.html,
          SCHEMA_SITEMAP_LOC_PARSE_LIMIT
        ).filter(isProductDiscoveryUrl);
        const sitemapParseLatencyMs = Date.now() - parseStart;
        if (urls.length > 0) {
          return {
            urls,
            sitemapFetchCount,
            sitemapParseLatencyMs,
            sitemapDecompressLatencyMs,
          };
        }
      }
      continue;
    }

    const parseStart = Date.now();
    const urls = parseSitemapLocUrls(res.html, SCHEMA_SITEMAP_LOC_PARSE_LIMIT).filter(
      isProductDiscoveryUrl
    );
    const sitemapParseLatencyMs = Date.now() - parseStart;
    if (urls.length > 0) {
      return {
        urls,
        sitemapFetchCount,
        sitemapParseLatencyMs,
        sitemapDecompressLatencyMs,
      };
    }
  }

  return { ...empty, sitemapFetchCount, sitemapDecompressLatencyMs };
}

function mapExtractedToResult(input: {
  extracted: {
    title: string;
    productUrl: string;
    imageUrl?: string | null;
    brand?: string | null;
  };
  supplierId: string;
  source: SupplierProductSource;
  score: number;
}): SupplierProductResult {
  return {
    supplierId: input.supplierId,
    title: input.extracted.title,
    brand: input.extracted.brand ?? null,
    imageUrl: input.extracted.imageUrl ?? null,
    price: null,
    availability: null,
    productUrl: input.extracted.productUrl,
    source: input.source,
    classification: classifyUrl(input.extracted.productUrl),
    score: input.score,
  };
}

type PageFetchTracker = {
  pageBytesFetched: number;
  pageFetchMsTotal: number;
  pageFetchMsCount: number;
  pageFetchFromCache: number;
  metadataCacheHit: number;
  metadataCacheMiss: number;
  metadataExtractionLatencyMs: number;
};

function initPageFetchTracker(): PageFetchTracker {
  return {
    pageBytesFetched: 0,
    pageFetchMsTotal: 0,
    pageFetchMsCount: 0,
    pageFetchFromCache: 0,
    metadataCacheHit: 0,
    metadataCacheMiss: 0,
    metadataExtractionLatencyMs: 0,
  };
}

function applyPageFetchTracker(
  telemetry: SchemaSitemapExecutionTelemetry,
  tracker: PageFetchTracker
) {
  telemetry.pageBytesFetched = tracker.pageBytesFetched;
  telemetry.metadataCacheHit = tracker.metadataCacheHit;
  telemetry.metadataCacheMiss = tracker.metadataCacheMiss;
  telemetry.metadataExtractionLatencyMs = tracker.metadataExtractionLatencyMs;
  telemetry.pageFetchFromCache = tracker.pageFetchFromCache;
  telemetry.averagePageFetchMs =
    tracker.pageFetchMsCount > 0
      ? Math.round(tracker.pageFetchMsTotal / tracker.pageFetchMsCount)
      : 0;
}

function recordFetchResponse(
  tracker: PageFetchTracker,
  response: { fromCache?: boolean; bytesFetched?: number; fetchLatencyMs?: number }
) {
  if (response.fromCache) {
    tracker.pageFetchFromCache += 1;
    return;
  }
  tracker.pageBytesFetched += response.bytesFetched ?? 0;
  if ((response.fetchLatencyMs ?? 0) > 0) {
    tracker.pageFetchMsTotal += response.fetchLatencyMs ?? 0;
    tracker.pageFetchMsCount += 1;
  }
}

function tryCachedMetadata(input: {
  url: string;
  query: string;
  browseRank?: RankedBrowseUrl;
  tracker: PageFetchTracker;
  deps?: ExecuteSchemaOrSitemapSearchDeps;
}): ExtractedProductMetadata | null {
  const cached = loadPageMetadataCache(input.url, input.deps);
  if (!cached) {
    input.tracker.metadataCacheMiss += 1;
    return null;
  }
  input.tracker.metadataCacheHit += 1;
  const urlScore = input.browseRank?.score ?? 0;
  if (!isProductDiscoveryUrl(cached.productUrl)) return null;
  if (
    !meetsBrowseRelevance(
      urlScore,
      cached.title,
      input.query,
      input.url,
      input.browseRank
    )
  ) {
    return null;
  }
  return cached;
}

function finalizeExtracted(input: {
  url: string;
  extracted: ExtractedProductMetadata;
  query: string;
  browseRank?: RankedBrowseUrl;
  fromMetadataCache: boolean;
  tracker: PageFetchTracker;
  deps?: ExecuteSchemaOrSitemapSearchDeps;
}): ExtractedProductMetadata | null {
  const urlScore = input.browseRank?.score ?? 0;
  if (!input.extracted.title.trim() || !input.extracted.productUrl) return null;
  if (!isProductDiscoveryUrl(input.extracted.productUrl)) return null;
  if (
    !meetsBrowseRelevance(
      urlScore,
      input.extracted.title,
      input.query,
      input.url,
      input.browseRank
    )
  ) {
    return null;
  }
  if (!input.fromMetadataCache) {
    writePageMetadataCache(input.url, input.extracted, input.deps);
  }
  return input.extracted;
}

async function resolveUrlToResult(input: {
  url: string;
  query: string;
  preferSchema: boolean;
  supplierId: string;
  source: SupplierProductSource;
  browseRank?: RankedBrowseUrl;
  budget: SchemaSitemapRequestBudget;
  telemetry: SchemaSitemapExecutionTelemetry;
  tracker: PageFetchTracker;
  deps?: ExecuteSchemaOrSitemapSearchDeps;
  allowFetch: boolean;
}): Promise<SupplierProductResult | null> {
  const cached = tryCachedMetadata({
    url: input.url,
    query: input.query,
    browseRank: input.browseRank,
    tracker: input.tracker,
    deps: input.deps,
  });
  if (cached) {
    const urlScore = input.browseRank?.score ?? 0;
    return mapExtractedToResult({
      extracted: cached,
      supplierId: input.supplierId,
      source: input.source,
      score: Math.max(urlScore, 0),
    });
  }

  if (!input.allowFetch) return null;
  if (!input.budget.canFetch() || !input.budget.consume()) return null;

  input.telemetry.productPagesFetched += 1;
  const response = await fetchSchemaSitemapUrl(input.url, input.deps);
  recordFetchResponse(input.tracker, response);

  const risk = classifyAntiBotResponse({
    status: response.status,
    html: response.html,
    url: input.url,
  }).antiBotRisk;
  if (risk === "HIGH" || risk === "HARD_BLOCK") {
    recordBlockedProductFetch(input.telemetry, {
      status: response.status,
      html: response.html,
      url: input.url,
    });
    return null;
  }
  if (response.status !== 200 || !response.html.trim()) return null;

  const extractStart = Date.now();
  const extracted = extractProductFromHtml(
    response.html,
    input.url,
    input.preferSchema
  );
  input.tracker.metadataExtractionLatencyMs += Date.now() - extractStart;
  if (!extracted) return null;

  const finalized = finalizeExtracted({
    url: input.url,
    extracted,
    query: input.query,
    browseRank: input.browseRank,
    fromMetadataCache: false,
    tracker: input.tracker,
    deps: input.deps,
  });
  if (!finalized) return null;

  const urlScore = input.browseRank?.score ?? 0;
  return mapExtractedToResult({
    extracted: finalized,
    supplierId: input.supplierId,
    source: input.source,
    score: Math.max(urlScore, 0),
  });
}

export async function executeSchemaOrSitemapSearch(
  input: ExecuteSchemaOrSitemapSearchInput,
  deps?: ExecuteSchemaOrSitemapSearchDeps
): Promise<ExecuteSchemaOrSitemapSearchResult> {
  const telemetry = emptyTelemetry();
  const preferSchema = input.facts.hasSchemaMarkup === true;
  const source =
    input.source ??
    resolveSupplierProductSource(
      input.supplierId,
      input.dbDomain ?? input.facts.canonicalDomain
    );

  const budget = new SchemaSitemapRequestBudget(SCHEMA_SITEMAP_MAX_REQUESTS);

  let discoveryUrls: string[] = [];
  if (input.facts.hasSitemap === true) {
    const storedUrls = normalizeStoredSitemapUrls(input.facts.sitemapUrls);
    const cacheInput = {
      supplierId: input.supplierId,
      sitemapUrls: storedUrls,
      parseLimit: SCHEMA_SITEMAP_LOC_PARSE_LIMIT,
    };
    const cached = loadDiscoveryUrlsCache(cacheInput, deps);

    if (cached) {
      discoveryUrls = cached.discoveryUrls;
      telemetry.discoveryUrlCacheHit = true;
      telemetry.discoveryUrlCount = discoveryUrls.length;
      telemetry.sitemapFetchCount = 0;
      telemetry.sitemapParseLatencyMs = 0;
      telemetry.sitemapDecompressLatencyMs = 0;
    } else {
      const collected = await collectPageUrlsFromStoredSitemaps(
        storedUrls,
        budget,
        deps
      );
      discoveryUrls = collected.urls;
      telemetry.discoveryUrlCacheHit = false;
      telemetry.discoveryUrlCount = discoveryUrls.length;
      telemetry.sitemapFetchCount = collected.sitemapFetchCount;
      telemetry.sitemapParseLatencyMs = collected.sitemapParseLatencyMs;
      telemetry.sitemapDecompressLatencyMs = collected.sitemapDecompressLatencyMs;
      if (discoveryUrls.length > 0) {
        writeDiscoveryUrlsCache(cacheInput, discoveryUrls, deps);
      }
    }
  }

  const rankStart = Date.now();
  const ranked = rankBrowseUrlsByQuery(
    discoveryUrls,
    input.query,
    DEFAULT_RANKED_URL_LIMIT
  );
  telemetry.urlRankingLatencyMs = Date.now() - rankStart;
  const rankByUrl = new Map<string, RankedBrowseUrl>(
    ranked.map((entry) => [entry.url, entry])
  );
  telemetry.candidateUrlsExamined = ranked.length;

  const fetchTargets = ranked
    .slice(0, SCHEMA_SITEMAP_MAX_PRODUCT_PAGES)
    .map((entry) => entry.url);

  const results: SupplierProductResult[] = [];
  const pageTracker = initPageFetchTracker();

  if (fetchTargets.length > 0) {
    const firstResult = await resolveUrlToResult({
      url: fetchTargets[0],
      query: input.query,
      preferSchema,
      supplierId: input.supplierId,
      source,
      browseRank: rankByUrl.get(fetchTargets[0]),
      budget,
      telemetry,
      tracker: pageTracker,
      deps,
      allowFetch: true,
    });
    if (firstResult) {
      results.push(firstResult);
      telemetry.earlyExitAfterPages = telemetry.productPagesFetched;
      applyPageFetchTracker(telemetry, pageTracker);
      return { status: "success", results: [firstResult], telemetry };
    }
  }

  let targetIndex = 1;
  while (targetIndex < fetchTargets.length && budget.canFetch()) {
    const batch: string[] = [];
    while (
      batch.length < SCHEMA_SITEMAP_PRODUCT_FETCH_CONCURRENCY &&
      targetIndex < fetchTargets.length &&
      budget.canFetch()
    ) {
      batch.push(fetchTargets[targetIndex]);
      targetIndex += 1;
    }
    if (batch.length === 0) break;

    const batchResults = await Promise.all(
      batch.map(async (url) => {
        const cached = tryCachedMetadata({
          url,
          query: input.query,
          browseRank: rankByUrl.get(url),
          tracker: pageTracker,
          deps,
        });
        if (cached) {
          const urlScore = rankByUrl.get(url)?.score ?? 0;
          return mapExtractedToResult({
            extracted: cached,
            supplierId: input.supplierId,
            source,
            score: Math.max(urlScore, 0),
          });
        }

        if (!budget.canFetch() || !budget.consume()) return null;
        telemetry.productPagesFetched += 1;

        const response = await fetchSchemaSitemapUrl(url, deps);
        recordFetchResponse(pageTracker, response);

        const risk = classifyAntiBotResponse({
          status: response.status,
          html: response.html,
          url,
        }).antiBotRisk;
        if (risk === "HIGH" || risk === "HARD_BLOCK") {
          recordBlockedProductFetch(telemetry, {
            status: response.status,
            html: response.html,
            url,
          });
          return null;
        }
        if (response.status !== 200 || !response.html.trim()) return null;

        const extractStart = Date.now();
        const extracted = extractProductFromHtml(
          response.html,
          url,
          preferSchema
        );
        pageTracker.metadataExtractionLatencyMs += Date.now() - extractStart;
        if (!extracted) return null;

        const finalized = finalizeExtracted({
          url,
          extracted,
          query: input.query,
          browseRank: rankByUrl.get(url),
          fromMetadataCache: false,
          tracker: pageTracker,
          deps,
        });
        if (!finalized) return null;

        const urlScore = rankByUrl.get(url)?.score ?? 0;
        return mapExtractedToResult({
          extracted: finalized,
          supplierId: input.supplierId,
          source,
          score: Math.max(urlScore, 0),
        });
      })
    );

    for (const result of batchResults) {
      if (result) results.push(result);
    }

    if (results.length > 0) {
      telemetry.earlyExitAfterPages = telemetry.productPagesFetched;
      break;
    }
  }

  applyPageFetchTracker(telemetry, pageTracker);

  results.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

  const deduped: SupplierProductResult[] = [];
  const seen = new Set<string>();
  for (const result of results) {
    const key = result.productUrl ?? result.title;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(result);
    if (deduped.length >= SCHEMA_SITEMAP_MAX_RESULTS) break;
  }

  if (deduped.length > 0) {
    return { status: "success", results: deduped, telemetry };
  }

  if (preferSchema && ranked.length > 0) {
    const schemaRetryTargets = ranked
      .slice(0, 3)
      .map((entry) => entry.url)
      .filter((url) => !fetchTargets.includes(url));

    for (const url of schemaRetryTargets) {
      const result = await resolveUrlToResult({
        url,
        query: input.query,
        preferSchema: true,
        supplierId: input.supplierId,
        source,
        browseRank: rankByUrl.get(url),
        budget,
        telemetry,
        tracker: pageTracker,
        deps,
        allowFetch: true,
      });
      if (result) {
        telemetry.earlyExitAfterPages = telemetry.productPagesFetched;
        applyPageFetchTracker(telemetry, pageTracker);
        return {
          status: "success",
          results: [result],
          telemetry,
        };
      }
    }
  }

  return { status: "empty", telemetry };
}
