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
import { extractProductFromHtml } from "../schema/extractProductMetadata";
import { extractListingProductsFromHtml } from "./extractListingProductsFromHtml";
import {
  DEFAULT_RANKED_URL_LIMIT,
  rankBrowseUrlsByQuery,
  meetsBrowseRelevance,
  getSubcategoryExpansionSeedUrls,
  type RankedBrowseUrl,
} from "../schema/rankBrowseUrlsByQuery";
import { isProductDiscoveryUrl } from "../schema/sitemapParse";
import {
  discoverHtmlCandidateUrls,
  type DiscoverHtmlCandidateUrlsDeps,
} from "./discoverHtmlCandidateUrls";
import { discoverHomepageCandidateUrls } from "./discoverHomepageCandidateUrls";
import { expandCategoryCandidateUrls } from "./expandCategoryCandidateUrls";
import {
  fetchHtmlScrapeUrlsParallel,
  HtmlScrapeRequestBudget,
  type HtmlScrapeFetchDeps,
} from "./fetchHtmlScrape.server";

export const HTML_SCRAPE_MAX_PAGES = 8;
export const HTML_SCRAPE_MAX_RESULTS = 6;
export const HTML_SCRAPE_PAGE_FETCH_CONCURRENCY = 3;

export type HtmlScrapeExecutionTelemetry = {
  candidateUrlsExamined: number;
  pagesFetched: number;
  pagesBlocked: number;
  extractionSuccessCount: number;
  latencyMs: number;
  discoverySource: "serp" | "homepage" | "mixed";
  serpOrganicCount: number;
  topUrlScore: number;
  aliasSourceProductType?: string;
  aliasMatchType?: RankedBrowseUrl["aliasMatchType"];
  subcategoryUrlsDiscovered?: number;
  antiBotRisk?: AntiBotRisk;
  antiBotCategory?: AntiBotCategory;
  blockedUrlClass?: BlockedUrlClass;
};

export type ExecuteHtmlScrapeSearchInput = {
  supplierId: string;
  query: string;
  dbDomain?: string | null;
  facts: SupplierFingerprintFacts;
  source?: SupplierProductSource;
};

export type ExecuteHtmlScrapeSearchResult =
  | {
      status: "success";
      results: SupplierProductResult[];
      telemetry: HtmlScrapeExecutionTelemetry;
    }
  | {
      status: "empty";
      telemetry: HtmlScrapeExecutionTelemetry;
    };

export type ExecuteHtmlScrapeSearchDeps = HtmlScrapeFetchDeps &
  DiscoverHtmlCandidateUrlsDeps;

function emptyTelemetry(
  overrides: Partial<HtmlScrapeExecutionTelemetry> = {}
): HtmlScrapeExecutionTelemetry {
  return {
    candidateUrlsExamined: 0,
    pagesFetched: 0,
    pagesBlocked: 0,
    extractionSuccessCount: 0,
    latencyMs: 0,
    discoverySource: "serp",
    serpOrganicCount: 0,
    topUrlScore: 0,
    ...overrides,
  };
}

function recordBlockedFetch(
  telemetry: HtmlScrapeExecutionTelemetry,
  response: { status: number | null; html: string; url: string }
): void {
  telemetry.pagesBlocked += 1;
  const classification = classifyAntiBotResponse({
    status: response.status,
    html: response.html,
    url: response.url,
  });
  telemetry.antiBotRisk = classification.antiBotRisk;
  telemetry.antiBotCategory = classification.antiBotCategory;
  telemetry.blockedUrlClass = classification.blockedUrlClass;
}

function hasRequiredImage(imageUrl: string | null | undefined): boolean {
  return typeof imageUrl === "string" && imageUrl.trim().length > 0;
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
}): SupplierProductResult | null {
  if (!hasRequiredImage(input.extracted.imageUrl)) return null;
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

function tryAppendExtractedResult(input: {
  extracted: {
    title: string;
    productUrl: string;
    imageUrl?: string | null;
    brand?: string | null;
  };
  supplierId: string;
  source: SupplierProductSource;
  urlScore: number;
  query: string;
  pageUrl: string;
  browseRank?: RankedBrowseUrl;
  results: SupplierProductResult[];
  telemetry: HtmlScrapeExecutionTelemetry;
}): boolean {
  if (!input.extracted.title.trim() || !input.extracted.productUrl) return false;
  if (!isProductDiscoveryUrl(input.extracted.productUrl)) return false;
  if (
    !meetsBrowseRelevance(
      input.urlScore,
      input.extracted.title,
      input.query,
      input.pageUrl,
      input.browseRank
    )
  ) {
    return false;
  }

  const mapped = mapExtractedToResult({
    extracted: input.extracted,
    supplierId: input.supplierId,
    source: input.source,
    score: Math.max(input.urlScore, 0),
  });
  if (!mapped) return false;

  input.telemetry.extractionSuccessCount += 1;
  if (input.browseRank?.aliasSourceProductType) {
    input.telemetry.aliasSourceProductType =
      input.browseRank.aliasSourceProductType;
  }
  if (input.browseRank?.aliasMatchType) {
    input.telemetry.aliasMatchType = input.browseRank.aliasMatchType;
  }
  input.results.push(mapped);
  return true;
}

export async function executeHtmlScrapeSearch(
  input: ExecuteHtmlScrapeSearchInput,
  deps?: ExecuteHtmlScrapeSearchDeps
): Promise<ExecuteHtmlScrapeSearchResult> {
  const start = Date.now();
  const domain = input.dbDomain ?? input.facts.canonicalDomain;
  if (!domain) {
    return {
      status: "empty",
      telemetry: emptyTelemetry({ latencyMs: Date.now() - start }),
    };
  }

  const source =
    input.source ??
    resolveSupplierProductSource(input.supplierId, domain);

  const serpDiscovery = await discoverHtmlCandidateUrls(
    { query: input.query, domain },
    deps
  );
  const homepageUrls = await discoverHomepageCandidateUrls({ domain }, deps);
  let candidateUrls = [
    ...new Set([...serpDiscovery.urls, ...homepageUrls]),
  ];
  const discoverySource =
    serpDiscovery.urls.length > 0 && homepageUrls.length > 0
      ? "mixed"
      : homepageUrls.length > 0
        ? "homepage"
        : "serp";

  const ranked = rankBrowseUrlsByQuery(
    candidateUrls,
    input.query,
    DEFAULT_RANKED_URL_LIMIT
  );

  const rankByUrl = new Map<string, RankedBrowseUrl>(
    ranked.map((entry) => [entry.url, entry])
  );

  const expansionSeeds = getSubcategoryExpansionSeedUrls(
    candidateUrls,
    input.query,
    ranked
  );
  const expandedCategoryUrls = await expandCategoryCandidateUrls(
    {
      domain,
      seedUrls: expansionSeeds,
      parentRankByUrl: rankByUrl,
    },
    deps
  );

  let subcategoryUrlsDiscovered = 0;
  for (const expanded of expandedCategoryUrls) {
    if (candidateUrls.includes(expanded.url)) continue;
    subcategoryUrlsDiscovered += 1;
    candidateUrls.push(expanded.url);
    const browseRank = rankBrowseUrlsByQuery([expanded.url], input.query, 1)[0];
    if (browseRank && browseRank.score > 0) {
      rankByUrl.set(expanded.url, {
        ...browseRank,
        aliasSourceProductType:
          browseRank.aliasSourceProductType ?? expanded.aliasSourceProductType,
        aliasMatchType: "subcategory_expansion",
      });
    }
  }

  let mergedRanked = [...rankByUrl.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, DEFAULT_RANKED_URL_LIMIT);

  if (mergedRanked.length === 0 && candidateUrls.length > 0) {
    const fallbackUrls = candidateUrls.filter((url) => {
      const resultType = classifyUrl(url);
      return (
        resultType === "CATEGORY_PAGE" ||
        resultType === "PRODUCT_PAGE" ||
        resultType === "SEARCH_PAGE"
      );
    });
    mergedRanked = fallbackUrls.slice(0, HTML_SCRAPE_MAX_PAGES).map((url) => ({
      url,
      score: 0.01,
    }));
    for (const entry of mergedRanked) {
      rankByUrl.set(entry.url, entry);
    }
  }

  const telemetry = emptyTelemetry({
    candidateUrlsExamined: mergedRanked.length,
    discoverySource,
    serpOrganicCount: serpDiscovery.serpOrganicCount,
    topUrlScore: mergedRanked[0]?.score ?? 0,
    aliasSourceProductType: mergedRanked[0]?.aliasSourceProductType,
    aliasMatchType: mergedRanked[0]?.aliasMatchType,
    subcategoryUrlsDiscovered,
  });

  const fetchTargets = mergedRanked
    .slice(0, HTML_SCRAPE_MAX_PAGES)
    .map((entry) => entry.url);

  const budget = new HtmlScrapeRequestBudget(HTML_SCRAPE_MAX_PAGES);
  const results: SupplierProductResult[] = [];

  let targetIndex = 0;
  while (targetIndex < fetchTargets.length && budget.canFetch()) {
    const batch: string[] = [];
    while (
      batch.length < HTML_SCRAPE_PAGE_FETCH_CONCURRENCY &&
      targetIndex < fetchTargets.length &&
      budget.canFetch()
    ) {
      if (budget.consume()) {
        batch.push(fetchTargets[targetIndex]);
      }
      targetIndex += 1;
    }
    if (batch.length === 0) break;

    const responses = await fetchHtmlScrapeUrlsParallel(
      batch,
      deps,
      batch.length
    );

    for (const response of responses) {
      telemetry.pagesFetched += 1;
      const browseRank = rankByUrl.get(response.url);
      const urlScore = browseRank?.score ?? 0;
      const risk = classifyAntiBotResponse({
        status: response.status,
        html: response.html,
        url: response.url,
      }).antiBotRisk;
      if (risk === "HIGH" || risk === "HARD_BLOCK") {
        recordBlockedFetch(telemetry, response);
        continue;
      }
      if (response.status !== 200 || !response.html.trim()) continue;

      const extracted = extractProductFromHtml(response.html, response.url, false);
      if (extracted) {
        tryAppendExtractedResult({
          extracted,
          supplierId: input.supplierId,
          source,
          urlScore,
          query: input.query,
          pageUrl: response.url,
          browseRank,
          results,
          telemetry,
        });
      }

      if (results.length === 0) {
        const listingProducts = extractListingProductsFromHtml(
          response.html,
          response.url
        );
        for (const listing of listingProducts) {
          if (
            tryAppendExtractedResult({
              extracted: listing,
              supplierId: input.supplierId,
              source,
              urlScore: Math.max(
                urlScore,
                browseRank?.score ?? 0,
                0.01
              ),
              query: input.query,
              pageUrl: listing.productUrl,
              browseRank,
              results,
              telemetry,
            })
          ) {
            break;
          }
        }
      }
    }

    if (results.length > 0) break;
  }

  results.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

  const deduped: SupplierProductResult[] = [];
  const seen = new Set<string>();
  for (const result of results) {
    const key = result.productUrl ?? result.title;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(result);
    if (deduped.length >= HTML_SCRAPE_MAX_RESULTS) break;
  }

  telemetry.latencyMs = Date.now() - start;

  if (deduped.length > 0) {
    return { status: "success", results: deduped, telemetry };
  }

  return { status: "empty", telemetry };
}
