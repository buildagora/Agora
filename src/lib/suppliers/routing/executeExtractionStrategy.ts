import type { ExtractionStrategy } from "@prisma/client";
import type { AntiBotRisk } from "@prisma/client";
import type { SupplierFingerprintFacts } from "../fingerprint/types";
import type {
  AntiBotCategory,
  BlockedUrlClass,
} from "../fingerprint/classifyAntiBotResponse";
import type { SupplierProductResult } from "../types";
import type { searchSupplierSite } from "../searchSupplierSite";
import { executePlatformCatalogSearch } from "../executePlatformCatalogSearch";
import { mapCapabilityMatchesToProfileResults } from "../capability/mapCapabilityProfileResults";
import { resolveSupplierProductSource } from "../capability/resolveSupplierProductSource";
import {
  searchSupplierCapabilityProfile,
  type SearchSupplierCapabilityProfileOptions,
} from "../capability/searchSupplierCapabilityProfile";
import { buildSerpSiteOrganicParams } from "./buildSerpSiteOrganicParams";
import { executeHtmlScrapeSearch } from "../html/executeHtmlScrapeSearch";
import { executeSchemaOrSitemapSearch } from "../schema/executeSchemaOrSitemapSearch";
import {
  isPlatformApiExecutionAllowed,
  isPublicApiExecutionAllowed,
  resolvePlatformCatalogExecution,
} from "./resolvePlatformCatalogExecution";
import {
  getHtmlScrapeUnsupportedReason,
  isHtmlScrapeExecutionAllowed,
} from "./resolveHtmlScrapeExecution";
import {
  getSchemaOrSitemapUnsupportedReason,
  isSchemaOrSitemapExecutionAllowed,
} from "./resolveSchemaOrSitemapExecution";
import { resolveProductEngineAdapter } from "./resolveProductEngineExecution";
import { searchHomeDepot } from "../homeDepot";
import { searchLowes } from "../lowes";

export type CapabilityProfileExecutionMetadata = {
  capabilityMatchCount: number;
  capabilityScoreMin: number;
  capabilityScoreMax: number;
};

export type SchemaSitemapExecutionMetadata = {
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

export type HtmlScrapeExecutionMetadata = {
  candidateUrlsExamined: number;
  pagesFetched: number;
  pagesBlocked: number;
  extractionSuccessCount: number;
  latencyMs: number;
  discoverySource: "serp" | "homepage" | "mixed";
  serpOrganicCount: number;
  topUrlScore: number;
  aliasSourceProductType?: string;
  aliasMatchType?: "direct_lexical" | "path_alias" | "title_alias" | "subcategory_expansion";
  subcategoryUrlsDiscovered?: number;
  antiBotRisk?: AntiBotRisk;
  antiBotCategory?: AntiBotCategory;
  blockedUrlClass?: BlockedUrlClass;
};

export type ExecuteExtractionStrategyInput = {
  strategy: ExtractionStrategy;
  supplierId: string;
  query: string;
  dbDomain?: string | null;
  facts: SupplierFingerprintFacts;
};

export type ExecuteExtractionStrategyResult =
  | {
      status: "success";
      results: SupplierProductResult[];
      capabilityProfile?: CapabilityProfileExecutionMetadata;
      schemaSitemap?: SchemaSitemapExecutionMetadata;
      htmlScrape?: HtmlScrapeExecutionMetadata;
    }
  | {
      status: "empty";
      schemaSitemap?: SchemaSitemapExecutionMetadata;
      htmlScrape?: HtmlScrapeExecutionMetadata;
    }
  | { status: "unsupported"; reason: string }
  | { status: "error"; reason: string };

export type ExecuteExtractionStrategyDeps = {
  searchSupplierSiteFn?: typeof searchSupplierSite;
  searchSupplierCapabilityProfileFn?: (
    supplierId: string,
    query: string,
    options?: SearchSupplierCapabilityProfileOptions
  ) => ReturnType<typeof searchSupplierCapabilityProfile>;
  executePlatformCatalogSearchFn?: typeof executePlatformCatalogSearch;
  executeSchemaOrSitemapSearchFn?: typeof executeSchemaOrSitemapSearch;
  executeHtmlScrapeSearchFn?: typeof executeHtmlScrapeSearch;
  searchLowesFn?: typeof searchLowes;
  searchHomeDepotFn?: typeof searchHomeDepot;
};

/**
 * Phase 1B/1C/2A/2B/3B/4A dispatcher — maps router strategy to existing executors.
 * SERP_SITE_ORGANIC, SERP_PRODUCT_ENGINE, PROBABILISTIC_CATEGORY_PROFILE,
 * PLATFORM_API, PUBLIC_API, SCHEMA_OR_SITEMAP (allowlisted), and HTML_SCRAPE
 * (allowlisted) are supported.
 */
export async function executeExtractionStrategy(
  input: ExecuteExtractionStrategyInput,
  deps?: ExecuteExtractionStrategyDeps
): Promise<ExecuteExtractionStrategyResult> {
  if (
    input.strategy === "PLATFORM_API" ||
    input.strategy === "PUBLIC_API"
  ) {
    const allowed =
      input.strategy === "PLATFORM_API"
        ? isPlatformApiExecutionAllowed(input.facts)
        : isPublicApiExecutionAllowed(input.facts);
    if (!allowed) {
      return {
        status: "unsupported",
        reason:
          input.strategy === "PLATFORM_API"
            ? "platform_access_not_allowed"
            : "public_api_access_not_allowed",
      };
    }

    const platformExec = resolvePlatformCatalogExecution(
      input.supplierId,
      input.dbDomain ?? input.facts.canonicalDomain
    );
    if (!platformExec) {
      return {
        status: "unsupported",
        reason: "platform_config_unavailable",
      };
    }

    const executePlatformCatalogSearchFn =
      deps?.executePlatformCatalogSearchFn ?? executePlatformCatalogSearch;
    try {
      const results = await executePlatformCatalogSearchFn({
        query: input.query,
        supplierIds: [input.supplierId],
        source: platformExec.source,
        logLabel: platformExec.logLabel,
        config: platformExec.config,
      });
      if (results.length === 0) {
        return { status: "empty" };
      }
      return { status: "success", results };
    } catch (err) {
      return {
        status: "error",
        reason: err instanceof Error ? err.message : String(err),
      };
    }
  }

  if (input.strategy === "PROBABILISTIC_CATEGORY_PROFILE") {
    const searchProfileFn =
      deps?.searchSupplierCapabilityProfileFn ??
      searchSupplierCapabilityProfile;
    try {
      const matches = await searchProfileFn(input.supplierId, input.query);
      if (matches.length === 0) {
        return { status: "empty" };
      }
      const source = resolveSupplierProductSource(
        input.supplierId,
        input.dbDomain ?? input.facts.canonicalDomain
      );
      const results = mapCapabilityMatchesToProfileResults(matches, {
        supplierId: input.supplierId,
        source,
      });
      if (results.length === 0) {
        return { status: "empty" };
      }
      const scores = matches.map((m) => m.score);
      return {
        status: "success",
        results,
        capabilityProfile: {
          capabilityMatchCount: results.length,
          capabilityScoreMin: Math.min(...scores),
          capabilityScoreMax: Math.max(...scores),
        },
      };
    } catch (err) {
      return {
        status: "error",
        reason: err instanceof Error ? err.message : String(err),
      };
    }
  }

  if (input.strategy === "HTML_SCRAPE") {
    if (!isHtmlScrapeExecutionAllowed(input.supplierId)) {
      return {
        status: "unsupported",
        reason:
          getHtmlScrapeUnsupportedReason(input.supplierId) ??
          "html_scrape_not_allowed",
      };
    }

    const executeHtmlScrapeSearchFn =
      deps?.executeHtmlScrapeSearchFn ?? executeHtmlScrapeSearch;
    try {
      const result = await executeHtmlScrapeSearchFn({
        supplierId: input.supplierId,
        query: input.query,
        dbDomain: input.dbDomain,
        facts: input.facts,
      });
      if (result.status === "success" && result.results.length > 0) {
        return {
          status: "success",
          results: result.results,
          htmlScrape: result.telemetry,
        };
      }
      return { status: "empty", htmlScrape: result.telemetry };
    } catch (err) {
      return {
        status: "error",
        reason: err instanceof Error ? err.message : String(err),
      };
    }
  }

  if (input.strategy === "SCHEMA_OR_SITEMAP") {
    if (!isSchemaOrSitemapExecutionAllowed(input.supplierId, input.facts)) {
      return {
        status: "unsupported",
        reason:
          getSchemaOrSitemapUnsupportedReason(input.supplierId, input.facts) ??
          "schema_or_sitemap_not_allowed",
      };
    }

    const executeSchemaOrSitemapSearchFn =
      deps?.executeSchemaOrSitemapSearchFn ?? executeSchemaOrSitemapSearch;
    try {
      const result = await executeSchemaOrSitemapSearchFn({
        supplierId: input.supplierId,
        query: input.query,
        dbDomain: input.dbDomain,
        facts: input.facts,
      });
      if (result.status === "success" && result.results.length > 0) {
        return {
          status: "success",
          results: result.results,
          schemaSitemap: result.telemetry,
        };
      }
      return { status: "empty", schemaSitemap: result.telemetry };
    } catch (err) {
      return {
        status: "error",
        reason: err instanceof Error ? err.message : String(err),
      };
    }
  }

  if (input.strategy === "SERP_PRODUCT_ENGINE") {
    const adapter = resolveProductEngineAdapter(input.supplierId);
    if (!adapter) {
      return {
        status: "unsupported",
        reason: "product_engine_not_configured",
      };
    }

    const searchLowesFn = deps?.searchLowesFn ?? searchLowes;
    const searchHomeDepotFn = deps?.searchHomeDepotFn ?? searchHomeDepot;

    try {
      const rawResults =
        adapter === "lowes"
          ? await searchLowesFn(input.query)
          : await searchHomeDepotFn(input.query);
      const results = rawResults.filter(
        (row) =>
          row.supplierId === input.supplierId &&
          typeof row.imageUrl === "string" &&
          row.imageUrl.trim().length > 0
      );
      if (results.length === 0) {
        return { status: "empty" };
      }
      return { status: "success", results };
    } catch (err) {
      return {
        status: "error",
        reason: err instanceof Error ? err.message : String(err),
      };
    }
  }

  if (input.strategy !== "SERP_SITE_ORGANIC") {
    return {
      status: "unsupported",
      reason: `strategy_${input.strategy.toLowerCase()}`,
    };
  }

  const domain = input.dbDomain ?? input.facts.canonicalDomain;
  const params = buildSerpSiteOrganicParams(
    input.supplierId,
    input.query,
    domain
  );
  if (!params) {
    return { status: "unsupported", reason: "serp_params_unavailable" };
  }

  const searchSupplierSiteFn =
    deps?.searchSupplierSiteFn ??
    (await import("../searchSupplierSite")).searchSupplierSite;
  try {
    const results = await searchSupplierSiteFn(params);
    if (results.length === 0) {
      return { status: "empty" };
    }
    return { status: "success", results };
  } catch (err) {
    return {
      status: "error",
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}
