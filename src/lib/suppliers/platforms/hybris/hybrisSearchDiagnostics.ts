import type { HybrisPlatformConfig } from "./types";
import { parseHybrisSearchHtml } from "./mapHybrisResult";

export type HybrisEmptyReason =
  | "redirect_category_page"
  | "empty_plp_shell"
  | "parse_miss"
  | "http_error"
  | "unsupported_variant"
  | "unknown_empty";

export type HybrisParsedProductMarkers = {
  productItem: number;
  productMainLink: number;
  dataProductId: number;
};

export type HybrisSearchDiagnostics = {
  requestUrl: string;
  finalUrl: string;
  httpStatus: number;
  htmlBytes: number;
  hybrisVariant: HybrisPlatformConfig["variant"];
  parsedProductCount: number;
  parsedProductMarkers: HybrisParsedProductMarkers;
  hybrisEmptyReason?: HybrisEmptyReason;
  retried: boolean;
  retryStrategy?: string;
};

export function countHybrisParsedProductMarkers(
  html: string,
  variant: HybrisPlatformConfig["variant"]
): HybrisParsedProductMarkers {
  if (variant === "lennox") {
    return {
      productItem: (html.match(/<li class="item/g) ?? []).length,
      productMainLink: (html.match(/productMainLink/g) ?? []).length,
      dataProductId: (html.match(/data-product-id="/g) ?? []).length,
    };
  }
  return {
    productItem: (html.match(/class="product-item/g) ?? []).length,
    productMainLink: 0,
    dataProductId: (html.match(/data-product-id="/g) ?? []).length,
  };
}

function isCategoryPath(url: string): boolean {
  try {
    return /\/c\/[^/]+/i.test(new URL(url).pathname);
  } catch {
    return /\/c\/[^/]+/i.test(url);
  }
}

export function classifyHybrisEmptyReason(input: {
  httpStatus: number;
  requestUrl: string;
  finalUrl: string;
  html: string;
  variant: HybrisPlatformConfig["variant"];
  parsedProductCount: number;
  markers: HybrisParsedProductMarkers;
}): HybrisEmptyReason {
  if (input.httpStatus < 200 || input.httpStatus >= 300) {
    return "http_error";
  }

  if (input.parsedProductCount > 0) {
    return "unknown_empty";
  }

  if (isCategoryPath(input.finalUrl) && input.requestUrl !== input.finalUrl) {
    return "redirect_category_page";
  }

  if (input.variant === "lennox") {
    if (input.markers.productMainLink > 0) {
      return "parse_miss";
    }
    if (
      input.markers.dataProductId > 0 &&
      input.markers.productMainLink === 0
    ) {
      return "empty_plp_shell";
    }
    if (input.html.includes("product-grid") || input.html.includes("productGrid")) {
      return "empty_plp_shell";
    }
  }

  if (input.variant === "siteone") {
    if (input.markers.productItem > 0) {
      return "parse_miss";
    }
    if (isCategoryPath(input.finalUrl)) {
      return "redirect_category_page";
    }
  }

  if (input.markers.productItem > 0 || input.markers.productMainLink > 0) {
    return "parse_miss";
  }

  return "unknown_empty";
}

export function parseHybrisProducts(
  html: string,
  config: HybrisPlatformConfig
) {
  return parseHybrisSearchHtml(html, config);
}

export function logHybrisSearchDiagnostics(
  logLabel: string,
  query: string,
  diagnostics: HybrisSearchDiagnostics
): void {
  console.info(
    JSON.stringify({
      event: "supplier_hybris_search",
      logLabel,
      query,
      ...diagnostics,
    })
  );
}

/** Lennox broad terms that return empty PLP shells; retry only when catalog returns real SKUs. */
export const LENNOX_BROAD_QUERY_RETRY: Readonly<Record<string, string>> = {
  furnace: "furnace parts",
  "air filter": "HVAC filter",
};
