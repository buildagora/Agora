import { mapHybrisProduct } from "./mapHybrisResult";
import {
  classifyHybrisEmptyReason,
  countHybrisParsedProductMarkers,
  LENNOX_BROAD_QUERY_RETRY,
  logHybrisSearchDiagnostics,
  parseHybrisProducts,
  type HybrisSearchDiagnostics,
} from "./hybrisSearchDiagnostics";
import type { HybrisSearchParams } from "./types";

function buildHybrisSearchUrl(
  query: string,
  config: HybrisSearchParams["hybris"],
  queryParamOverride?: string
): string {
  const queryParam = queryParamOverride ?? config.queryParam;
  const params = new URLSearchParams({ [queryParam]: query });
  const path = config.searchPath.startsWith("/")
    ? config.searchPath
    : `/${config.searchPath}`;
  return `${config.siteOrigin}${path}?${params.toString()}`;
}

type FetchHybrisHtmlResult = {
  html: string;
  requestUrl: string;
  finalUrl: string;
  httpStatus: number;
};

async function fetchHybrisHtml(
  requestUrl: string
): Promise<FetchHybrisHtmlResult> {
  const res = await fetch(requestUrl, {
    headers: {
      Accept: "text/html",
      "User-Agent": "Agora/1.0 (+supplier-discovery)",
    },
    redirect: "follow",
  });

  const html = await res.text();
  return {
    html,
    requestUrl,
    finalUrl: res.url,
    httpStatus: res.status,
  };
}

type SearchAttempt = {
  products: ReturnType<typeof parseHybrisProducts>;
  fetch: FetchHybrisHtmlResult;
};

async function runHybrisSearchAttempt(
  query: string,
  config: HybrisSearchParams["hybris"],
  queryParamOverride?: string
): Promise<SearchAttempt> {
  const requestUrl = buildHybrisSearchUrl(query, config, queryParamOverride);
  const fetchResult = await fetchHybrisHtml(requestUrl);
  const products =
    fetchResult.httpStatus >= 200 && fetchResult.httpStatus < 300
      ? parseHybrisProducts(fetchResult.html, config)
      : [];
  return { products, fetch: fetchResult };
}

function buildDiagnostics(
  config: HybrisSearchParams["hybris"],
  fetch: FetchHybrisHtmlResult,
  products: ReturnType<typeof parseHybrisProducts>,
  extra?: Partial<HybrisSearchDiagnostics>
): HybrisSearchDiagnostics {
  const markers = countHybrisParsedProductMarkers(fetch.html, config.variant);
  const base: HybrisSearchDiagnostics = {
    requestUrl: fetch.requestUrl,
    finalUrl: fetch.finalUrl,
    httpStatus: fetch.httpStatus,
    htmlBytes: fetch.html.length,
    hybrisVariant: config.variant,
    parsedProductCount: products.length,
    parsedProductMarkers: markers,
    retried: false,
    ...extra,
  };
  if (products.length === 0) {
    base.hybrisEmptyReason = classifyHybrisEmptyReason({
      httpStatus: fetch.httpStatus,
      requestUrl: fetch.requestUrl,
      finalUrl: fetch.finalUrl,
      html: fetch.html,
      variant: config.variant,
      parsedProductCount: products.length,
      markers,
    });
  }
  return base;
}

async function searchWithRetries(
  query: string,
  config: HybrisSearchParams["hybris"],
  logLabel: string
): Promise<{
  products: ReturnType<typeof parseHybrisProducts>;
  diagnostics: HybrisSearchDiagnostics;
}> {
  let attempt = await runHybrisSearchAttempt(query, config);
  let diagnostics = buildDiagnostics(config, attempt.fetch, attempt.products);

  if (attempt.products.length > 0) {
    return { products: attempt.products, diagnostics };
  }

  if (config.variant === "siteone") {
    const shouldRetryWithQ =
      diagnostics.hybrisEmptyReason === "redirect_category_page" &&
      config.queryParam === "text";

    if (shouldRetryWithQ) {
      const retry = await runHybrisSearchAttempt(query, config, "q");
      const retryDiagnostics = buildDiagnostics(config, retry.fetch, retry.products, {
        retried: true,
        retryStrategy: "siteone_query_param_q",
      });
      logHybrisSearchDiagnostics(logLabel, query, retryDiagnostics);
      return {
        products: retry.products,
        diagnostics: retryDiagnostics,
      };
    }
  }

  if (config.variant === "lennox") {
    const retryQuery = LENNOX_BROAD_QUERY_RETRY[query.trim().toLowerCase()];
    if (
      retryQuery &&
      (diagnostics.hybrisEmptyReason === "empty_plp_shell" ||
        diagnostics.hybrisEmptyReason === "unknown_empty")
    ) {
      const retry = await runHybrisSearchAttempt(retryQuery, config);
      const retryDiagnostics = buildDiagnostics(config, retry.fetch, retry.products, {
        retried: true,
        retryStrategy: `lennox_broad_query:${retryQuery}`,
      });
      logHybrisSearchDiagnostics(logLabel, query, retryDiagnostics);
      return {
        products: retry.products,
        diagnostics: retryDiagnostics,
      };
    }
  }

  logHybrisSearchDiagnostics(logLabel, query, diagnostics);
  return { products: attempt.products, diagnostics };
}

export async function searchHybrisCatalog(
  params: HybrisSearchParams
): Promise<import("../../types").SupplierProductResult[]> {
  const q = params.query.trim();
  if (!q || params.supplierIds.length === 0) return [];

  const hybris = params.hybris;

  try {
    const { products, diagnostics } = await searchWithRetries(
      q,
      hybris,
      params.logLabel
    );

    if (products.length === 0) {
      return [];
    }

    const mapped: import("../../types").SupplierProductResult[] = [];
    const limited = products.slice(0, hybris.numResults);

    for (const product of limited) {
      for (const supplierId of params.supplierIds) {
        mapped.push(
          mapHybrisProduct({
            product,
            supplierId,
            source: params.source,
          })
        );
      }
    }

    return mapped;
  } catch (err) {
    logHybrisSearchDiagnostics(params.logLabel, q, {
      requestUrl: buildHybrisSearchUrl(q, hybris),
      finalUrl: buildHybrisSearchUrl(q, hybris),
      httpStatus: 0,
      htmlBytes: 0,
      hybrisVariant: hybris.variant,
      parsedProductCount: 0,
      parsedProductMarkers: {
        productItem: 0,
        productMainLink: 0,
        dataProductId: 0,
      },
      hybrisEmptyReason: "http_error",
      retried: false,
    });
    console.warn(
      `Hybris search failed for ${params.logLabel}:`,
      err instanceof Error ? err.message : String(err)
    );
    return [];
  }
}
