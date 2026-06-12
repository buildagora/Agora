import { getSerpApiKey } from "@/lib/config/env";
import { rankShoppingResults } from "@/lib/search/shopping/rankShoppingResults";
import type { ShoppingResultItem } from "@/lib/search/shopping/types";
import { cachedSerpFetch } from "@/lib/serpCache/server";
import {
  clampStorefrontPage,
  clampStorefrontPageSize,
  STOREFRONT_DEFAULT_NUM_RESULTS,
  STOREFRONT_SERP_MAX_PAGES,
} from "@/lib/search/storefront/storefrontCatalogConstants";
import type {
  SupplierCatalogPageOptions,
  SupplierCatalogPageResult,
} from "./supplierCatalogPageOptions";
import type { SupplierProductResult } from "./types";

const LOWES_STORES = [
  "lowes_south_hsv",
  "lowes_hsv",
  "lowes_north_hsv",
  "lowes_madison_hsv",
  "lowes_madison",
] as const;

function buildLowesSearchUrl(query: string, apiKey: string, start: number): string {
  const params = new URLSearchParams({
    engine: "google_shopping",
    q: query,
    api_key: apiKey,
  });
  if (start > 0) {
    params.set("start", String(start));
  }
  return `https://serpapi.com/search.json?${params.toString()}`;
}

export async function searchLowesPaged(
  query: string,
  options: SupplierCatalogPageOptions = {}
): Promise<SupplierCatalogPageResult> {
  const q = query.trim();
  if (!q) return { products: [], totalCount: null, hasMore: false };

  const page = clampStorefrontPage(options.page ?? 1);
  const pageSize = clampStorefrontPageSize(
    options.pageSize ?? STOREFRONT_DEFAULT_NUM_RESULTS
  );
  const start = (page - 1) * pageSize;

  try {
    const apiKey = getSerpApiKey();
    const url = buildLowesSearchUrl(q, apiKey, start);
    const res = await cachedSerpFetch(url);
    const data = await res.json();

    const ranked = rankShoppingResults(
      (data.shopping_results || []) as ShoppingResultItem[],
      q
    );
    const pageSlice = ranked.slice(0, pageSize);

    const mapped: SupplierProductResult[] = [];

    for (const result of pageSlice) {
      const item = result.item;
      for (const supplierId of LOWES_STORES) {
        mapped.push({
          supplierId,
          title: item.title || q,
          brand: item.brand || null,
          imageUrl:
            item.thumbnail ||
            item.serpapi_thumbnail ||
            item.images?.[0]?.thumbnail ||
            item.images?.[0]?.original ||
            null,
          price: item.price || null,
          availability: "Available online / check store",
          productUrl:
            item.link || item.product_link || item.serpapi_immersive_product_api || null,
          source: "LOWES",
          score: result.score,
          rankingSignals: result.rankingSignals,
        });
      }
    }

    const hasMore =
      page < STOREFRONT_SERP_MAX_PAGES && pageSlice.length >= pageSize;

    return {
      products: mapped,
      totalCount: ranked.length > pageSlice.length ? ranked.length : null,
      hasMore,
    };
  } catch (err) {
    console.error("SerpApi Lowe's search failed:", err);
    return { products: [], totalCount: null, hasMore: false };
  }
}

export async function searchLowes(
  query: string,
  options?: SupplierCatalogPageOptions
): Promise<SupplierProductResult[]> {
  const result = await searchLowesPaged(query, options);
  return result.products;
}
