/** Initial products loaded on storefront page render (Load More fetches the rest). */
export const STOREFRONT_INITIAL_PAGE_SIZE = 12;

/** Products fetched per Load More click. */
export const STOREFRONT_LOAD_MORE_SIZE = 24;

/** Hard ceiling per API request. */
export const STOREFRONT_MAX_PAGE_SIZE = 48;

/** Max Serp Shopping / product-engine pages per session. */
export const STOREFRONT_SERP_MAX_PAGES = 4;

/** Organic site search hits to process (replaces single-hit early break). */
export const STOREFRONT_SITE_ORGANIC_MAX_HITS = 10;

/** Default platform / adapter result count (replaces legacy 6). */
export const STOREFRONT_DEFAULT_NUM_RESULTS = 24;

export function clampStorefrontPageSize(size: number): number {
  if (!Number.isFinite(size) || size < 1) return STOREFRONT_INITIAL_PAGE_SIZE;
  return Math.min(Math.floor(size), STOREFRONT_MAX_PAGE_SIZE);
}

export function clampStorefrontPage(page: number): number {
  if (!Number.isFinite(page) || page < 1) return 1;
  return Math.min(Math.floor(page), STOREFRONT_SERP_MAX_PAGES);
}
