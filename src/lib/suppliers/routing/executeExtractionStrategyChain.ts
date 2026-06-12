import type { ExtractionStrategy } from "@prisma/client";
import type { SupplierFingerprintFacts } from "../fingerprint/types";
import type { SupplierProductResult } from "../types";
import {
  executeExtractionStrategy,
  type ExecuteExtractionStrategyDeps,
  type ExecuteExtractionStrategyResult,
  type HtmlScrapeExecutionMetadata,
  type SchemaSitemapExecutionMetadata,
} from "./executeExtractionStrategy";
import type {
  StrategyExecutionAttempt,
  StrategyPlan,
  StrategyResolution,
} from "./types";

export type ExecuteExtractionStrategyChainInput = {
  plan: StrategyPlan | StrategyResolution;
  supplierId: string;
  query: string;
  dbDomain?: string | null;
  facts: SupplierFingerprintFacts;
};

export type ExecuteExtractionStrategyChainDeps = {
  executeStrategy?: (
    input: Parameters<typeof executeExtractionStrategy>[0],
    deps?: ExecuteExtractionStrategyDeps
  ) => Promise<ExecuteExtractionStrategyResult>;
  executionTimeoutMs?: number;
};

export type ChainExecutionResult = {
  results: SupplierProductResult[];
  finalStrategyUsed?: ExtractionStrategy;
  attempts: StrategyExecutionAttempt[];
  fallbackDepth: number;
  chainExhausted: boolean;
};

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("router_timeout")),
          timeoutMs
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function toAttempt(
  strategy: ExtractionStrategy,
  status: StrategyExecutionAttempt["status"],
  latencyMs: number,
  reason?: string,
  resultCount?: number
): StrategyExecutionAttempt {
  return {
    strategy,
    status,
    reason,
    resultCount,
    latencyMs,
  };
}

function antiBotAttemptFields(
  source:
    | HtmlScrapeExecutionMetadata
    | SchemaSitemapExecutionMetadata
    | undefined
): Partial<StrategyExecutionAttempt> {
  if (!source) return {};
  return {
    antiBotRisk: source.antiBotRisk,
    antiBotCategory: source.antiBotCategory,
    blockedUrlClass: source.blockedUrlClass,
  };
}

function htmlScrapeAttemptFields(
  htmlScrape: HtmlScrapeExecutionMetadata | undefined
): Partial<StrategyExecutionAttempt> {
  if (!htmlScrape) return {};
  return {
    candidateUrlsExamined: htmlScrape.candidateUrlsExamined,
    pagesFetched: htmlScrape.pagesFetched,
    pagesBlocked: htmlScrape.pagesBlocked,
    extractionSuccessCount: htmlScrape.extractionSuccessCount,
    latencyMs: htmlScrape.latencyMs,
    discoverySource: htmlScrape.discoverySource,
    serpOrganicCount: htmlScrape.serpOrganicCount,
    topUrlScore: htmlScrape.topUrlScore,
    aliasSourceProductType: htmlScrape.aliasSourceProductType,
    aliasMatchType: htmlScrape.aliasMatchType,
    subcategoryUrlsDiscovered: htmlScrape.subcategoryUrlsDiscovered,
    ...antiBotAttemptFields(htmlScrape),
  };
}

function schemaSitemapAttemptFields(
  schemaSitemap: SchemaSitemapExecutionMetadata | undefined
): Partial<StrategyExecutionAttempt> {
  if (!schemaSitemap) return {};
  return {
    candidateUrlsExamined: schemaSitemap.candidateUrlsExamined,
    productPagesFetched: schemaSitemap.productPagesFetched,
    productPagesBlocked: schemaSitemap.productPagesBlocked,
    pagesBlocked: schemaSitemap.productPagesBlocked,
    discoveryUrlCacheHit: schemaSitemap.discoveryUrlCacheHit,
    discoveryUrlCount: schemaSitemap.discoveryUrlCount,
    sitemapFetchCount: schemaSitemap.sitemapFetchCount,
    sitemapParseLatencyMs: schemaSitemap.sitemapParseLatencyMs,
    sitemapDecompressLatencyMs: schemaSitemap.sitemapDecompressLatencyMs,
    urlRankingLatencyMs: schemaSitemap.urlRankingLatencyMs,
    pageBytesFetched: schemaSitemap.pageBytesFetched,
    averagePageFetchMs: schemaSitemap.averagePageFetchMs,
    metadataCacheHit: schemaSitemap.metadataCacheHit,
    metadataCacheMiss: schemaSitemap.metadataCacheMiss,
    metadataExtractionLatencyMs: schemaSitemap.metadataExtractionLatencyMs,
    pageFetchFromCache: schemaSitemap.pageFetchFromCache,
    earlyExitAfterPages: schemaSitemap.earlyExitAfterPages,
    ...antiBotAttemptFields(schemaSitemap),
  };
}

function attemptFromResult(
  strategy: ExtractionStrategy,
  result: ExecuteExtractionStrategyResult,
  latencyMs: number
): StrategyExecutionAttempt {
  switch (result.status) {
    case "success": {
      const attempt = toAttempt(
        strategy,
        "success",
        latencyMs,
        undefined,
        result.results.length
      );
      if (result.capabilityProfile) {
        return {
          ...attempt,
          capabilityMatchCount: result.capabilityProfile.capabilityMatchCount,
          capabilityScoreMin: result.capabilityProfile.capabilityScoreMin,
          capabilityScoreMax: result.capabilityProfile.capabilityScoreMax,
        };
      }
      if (result.schemaSitemap) {
        return {
          ...attempt,
          ...schemaSitemapAttemptFields(result.schemaSitemap),
        };
      }
      if (result.htmlScrape) {
        return {
          ...attempt,
          ...htmlScrapeAttemptFields(result.htmlScrape),
        };
      }
      return attempt;
    }
    case "empty": {
      const emptyAttempt = toAttempt(strategy, "empty", latencyMs, "empty_results");
      if (result.schemaSitemap) {
        return {
          ...emptyAttempt,
          ...schemaSitemapAttemptFields(result.schemaSitemap),
        };
      }
      if (result.htmlScrape) {
        return {
          ...emptyAttempt,
          ...htmlScrapeAttemptFields(result.htmlScrape),
        };
      }
      return emptyAttempt;
    }
    case "unsupported":
      return toAttempt(strategy, "unsupported", latencyMs, result.reason);
    case "error":
      return toAttempt(strategy, "error", latencyMs, result.reason);
  }
}

function resolveStrategyTimeoutMs(
  strategy: ExtractionStrategy,
  defaultMs: number
): number {
  if (strategy !== "SERP_PRODUCT_ENGINE") return defaultMs;
  const envOverride = Number(
    process.env.FINGERPRINT_ROUTER_PRODUCT_ENGINE_TIMEOUT_MS
  );
  if (Number.isFinite(envOverride) && envOverride > 0) {
    return Math.max(defaultMs, envOverride);
  }
  return Math.max(defaultMs, 90_000);
}

/**
 * Walk a router strategy plan in order. Stops on first non-empty success.
 */
export async function executeExtractionStrategyChain(
  input: ExecuteExtractionStrategyChainInput,
  deps?: ExecuteExtractionStrategyChainDeps
): Promise<ChainExecutionResult> {
  const executeStrategy = deps?.executeStrategy ?? executeExtractionStrategy;
  const timeoutMs = deps?.executionTimeoutMs ?? 8000;
  const attempts: StrategyExecutionAttempt[] = [];

  for (let index = 0; index < input.plan.fullOrderedChain.length; index++) {
    const strategy = input.plan.fullOrderedChain[index];
    const start = Date.now();

    try {
      const result = await withTimeout(
        executeStrategy({
          strategy,
          supplierId: input.supplierId,
          query: input.query,
          dbDomain: input.dbDomain,
          facts: input.facts,
        }),
        resolveStrategyTimeoutMs(strategy, timeoutMs)
      );
      const latencyMs = Date.now() - start;
      attempts.push(attemptFromResult(strategy, result, latencyMs));

      if (result.status === "success" && result.results.length > 0) {
        return {
          results: result.results,
          finalStrategyUsed: strategy,
          attempts,
          fallbackDepth: index,
          chainExhausted: false,
        };
      }
    } catch (err) {
      const latencyMs = Date.now() - start;
      const isTimeout =
        err instanceof Error && err.message === "router_timeout";
      attempts.push(
        toAttempt(
          strategy,
          isTimeout ? "timeout" : "error",
          latencyMs,
          isTimeout ? "router_timeout" : "router_error"
        )
      );
    }
  }

  return {
    results: [],
    attempts,
    fallbackDepth: Math.max(0, input.plan.fullOrderedChain.length - 1),
    chainExhausted: true,
  };
}
