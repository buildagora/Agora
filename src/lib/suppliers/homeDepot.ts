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

/** Huntsville market ZIP for delivery / localization (SerpApi `delivery_zip`). */
const HOME_DEPOT_DELIVERY_ZIP = "35801";

const HOME_DEPOT_STORES = [
  "home_depot_hsv",
  "home_depot_madison",
  "home_depot_south_hsv",
  "home_depot_north_hsv",
  "home_depot_west_hsv",
] as const;

/** SerpApi `home_depot` engine product row (subset). */
type HomeDepotSerpProduct = {
  title?: string;
  brand?: string | null;
  price?: number | string | null;
  thumbnails?: Array<string[] | string>;
  thumbnail?: string;
  link?: string;
  product_link?: string;
  url?: string;
  product_id?: string;
};

function formatHomeDepotPrice(price: HomeDepotSerpProduct["price"]): string | null {
  if (price == null || price === "") return null;
  if (typeof price === "number" && Number.isFinite(price)) {
    return `$${price.toFixed(2)}`;
  }
  const raw = String(price).trim();
  if (!raw) return null;
  return raw.startsWith("$") ? raw : `$${raw}`;
}

function extractHomeDepotThumbnail(product: HomeDepotSerpProduct): string | null {
  if (typeof product.thumbnail === "string" && product.thumbnail.trim()) {
    return product.thumbnail.trim();
  }

  const thumbs = product.thumbnails;
  if (!Array.isArray(thumbs) || thumbs.length === 0) return null;

  const first = thumbs[0];
  if (typeof first === "string" && first.trim()) return first.trim();
  if (Array.isArray(first)) {
    for (const url of first) {
      if (typeof url === "string" && url.trim()) return url.trim();
    }
  }

  return null;
}

function isBlockedProductUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return (
    lower.includes("serpapi.com") ||
    lower.includes("google.com") ||
    lower.includes("googleusercontent.com") ||
    lower.includes("goo.gl") ||
    lower.includes("google_shopping")
  );
}

/** True when URL is a Home Depot product detail page (not category/browse). */
function isHomeDepotPdpUrl(url: string): boolean {
  if (!url.trim() || isBlockedProductUrl(url)) return false;

  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (
      !host.endsWith("homedepot.com") &&
      !host.endsWith("homedepot.ca") &&
      host !== "apionline.homedepot.com"
    ) {
      return false;
    }

    const path = parsed.pathname.toLowerCase();
    if (path.includes("/p/")) return true;
    if (host.endsWith("homedepot.ca") && path.includes("/product/")) return true;

    return false;
  } catch {
    return false;
  }
}

/** SerpApi often returns apionline.homedepot.com; buyers expect www.homedepot.com PDPs. */
function canonicalizeHomeDepotPdpUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (host === "apionline.homedepot.com") {
      parsed.hostname = "www.homedepot.com";
      return parsed.toString();
    }
    return url;
  } catch {
    return url;
  }
}

function resolveHomeDepotPdpUrl(product: HomeDepotSerpProduct): string | null {
  const candidates = [product.link, product.product_link, product.url].filter(
    (v): v is string => typeof v === "string" && v.trim().length > 0
  );

  for (const candidate of candidates) {
    const trimmed = candidate.trim();
    if (isHomeDepotPdpUrl(trimmed)) {
      return canonicalizeHomeDepotPdpUrl(trimmed);
    }
  }

  return null;
}

function extractHomeDepotProducts(data: Record<string, unknown>): HomeDepotSerpProduct[] {
  const products = data.products;
  if (Array.isArray(products)) return products as HomeDepotSerpProduct[];

  const legacy = data.products_results;
  if (Array.isArray(legacy)) {
    console.warn(
      "SerpApi Home Depot: using products_results fallback; expected products[]",
      { keys: Object.keys(data) }
    );
    return legacy as HomeDepotSerpProduct[];
  }

  if (Array.isArray(data.shopping_results)) {
    console.warn(
      "SerpApi Home Depot: unexpected shopping_results in home_depot response; ignoring Google Shopping shape",
      { keys: Object.keys(data) }
    );
  }

  return [];
}

function normalizeToShoppingItems(
  rawProducts: HomeDepotSerpProduct[],
  query: string
): ShoppingResultItem[] {
  const items: ShoppingResultItem[] = [];

  for (const raw of rawProducts) {
    const productUrl = resolveHomeDepotPdpUrl(raw);
    if (!productUrl) {
      console.warn("SerpApi Home Depot: skipping item without PDP URL", {
        query,
        title: raw.title,
        product_id: raw.product_id,
        link: raw.link,
      });
      continue;
    }

    items.push({
      title: raw.title,
      brand: raw.brand ?? undefined,
      thumbnail: extractHomeDepotThumbnail(raw) ?? undefined,
      link: productUrl,
      product_link: productUrl,
      price: formatHomeDepotPrice(raw.price) ?? undefined,
    });
  }

  return items;
}

function buildHomeDepotSearchUrl(query: string, apiKey: string, page = 1): string {
  const params = new URLSearchParams({
    engine: "home_depot",
    q: query,
    api_key: apiKey,
    country: "us",
    delivery_zip: HOME_DEPOT_DELIVERY_ZIP,
  });
  if (page > 1) {
    params.set("page", String(page));
  }

  return `https://serpapi.com/search.json?${params.toString()}`;
}

const pendingHomeDepotSearches = new Map<
  string,
  Promise<SupplierCatalogPageResult>
>();

async function searchHomeDepotInternal(
  query: string,
  options: SupplierCatalogPageOptions = {}
): Promise<SupplierCatalogPageResult> {
  const page = clampStorefrontPage(options.page ?? 1);
  const pageSize = clampStorefrontPageSize(
    options.pageSize ?? STOREFRONT_DEFAULT_NUM_RESULTS
  );
  const apiKey = getSerpApiKey();
  const url = buildHomeDepotSearchUrl(query, apiKey, page);

  try {
    const res = await cachedSerpFetch(url);
    const data = (await res.json()) as Record<string, unknown>;

    const rawProducts = extractHomeDepotProducts(data);
    if (rawProducts.length === 0) {
      console.warn("SerpApi Home Depot: no products in response", {
        query,
        keys: Object.keys(data),
        error: data.error,
      });
      return { products: [], totalCount: null, hasMore: false };
    }

    const shoppingItems = normalizeToShoppingItems(rawProducts, query);
    if (shoppingItems.length === 0) {
      console.warn("SerpApi Home Depot: no items with valid PDP URLs after normalization", {
        query,
        rawCount: rawProducts.length,
      });
      return { products: [], totalCount: null, hasMore: false };
    }

    const ranked = rankShoppingResults(shoppingItems, query);
    const totalCount = ranked.length;
    const start = (page - 1) * pageSize;
    const pageSlice = ranked.slice(start, start + pageSize);

    const mapped: SupplierProductResult[] = [];

    for (const result of pageSlice) {
      const item = result.item;
      const productUrl = resolveHomeDepotPdpUrl({
        link: item.link,
        product_link: item.product_link,
      });

      if (!productUrl) continue;

      for (const supplierId of HOME_DEPOT_STORES) {
        mapped.push({
          supplierId,
          title: item.title || query,
          brand: item.brand || null,
          imageUrl: item.thumbnail || item.images?.[0]?.thumbnail || null,
          price: item.price || null,
          availability: "Available online / check store",
          productUrl,
          source: "HOME_DEPOT",
          score: result.score,
          rankingSignals: result.rankingSignals,
        });
      }
    }

    const hasMore =
      page < STOREFRONT_SERP_MAX_PAGES && start + pageSize < totalCount;

    return { products: mapped, totalCount, hasMore };
  } catch (err) {
    console.error("SerpApi Home Depot search failed:", err);
    return { products: [], totalCount: null, hasMore: false };
  }
}

export async function searchHomeDepotPaged(
  query: string,
  options: SupplierCatalogPageOptions = {}
): Promise<SupplierCatalogPageResult> {
  const q = query.trim();
  if (!q) return { products: [], totalCount: null, hasMore: false };

  const cacheKey = `${q}::${options.page ?? 1}::${options.pageSize ?? STOREFRONT_DEFAULT_NUM_RESULTS}`;
  const pending = pendingHomeDepotSearches.get(cacheKey);
  if (pending) return pending;

  const promise = searchHomeDepotInternal(q, options).finally(() => {
    pendingHomeDepotSearches.delete(cacheKey);
  });
  pendingHomeDepotSearches.set(cacheKey, promise);
  return promise;
}

export async function searchHomeDepot(
  query: string,
  options?: SupplierCatalogPageOptions
): Promise<SupplierProductResult[]> {
  const result = await searchHomeDepotPaged(query, options);
  return result.products;
}
