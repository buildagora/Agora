import { getSerpApiKey } from "@/lib/config/env";
import type { SearchResultType } from "@/lib/search/classification/resultTypes";
import {
  fetchSupplierPageHtml,
  resolvePageImageUrl,
} from "@/lib/search/extraction/pageImageExtraction";
import {
  rankOrganicCandidates,
  type ScoredOrganicCandidate,
} from "@/lib/search/extraction/scoreOrganicCandidateUrl";
import { cachedSerpFetch } from "@/lib/serpCache/server";
import {
  STOREFRONT_DEFAULT_NUM_RESULTS,
  STOREFRONT_SITE_ORGANIC_MAX_HITS,
} from "@/lib/search/storefront/storefrontCatalogConstants";
import {
  dedupeSupplierSiteRows,
  mergeSupplierSiteSearchFlatRows,
} from "./mergeSupplierSiteSearchRows";
import type { SupplierSiteSearchStructured } from "./searchSupplierSiteTypes";
import type { SupplierProductResult, SupplierProductSource } from "./types";

export type { SupplierSiteSearchStructured } from "./searchSupplierSiteTypes";

export type SearchSupplierSiteParams = {
  query: string;
  domain: string;
  supplierIds: string[];
  source: SupplierProductSource;
  logLabel: string;
  /** When true with ABC_SUPPLY, fetches pages and uses WordPress `wp-post-image` imgs only (no og/twitter). */
  extractImagesFromPage?: boolean;
  maxOrganicHits?: number;
  minProductTarget?: number;
};

const MAX_PAGE_IMAGE_FETCH_ATTEMPTS = 3;

type SerpOrganicItem = {
  link?: string;
  title?: string;
  thumbnail?: string;
};

type SerpInlineImage = {
  title?: string;
  original?: string;
  thumbnail?: string;
};

type SerpShoppingResult = {
  title?: string;
  source?: string;
  thumbnail?: string;
};

function isSameDomain(url: string, domain: string): boolean {
  try {
    const host = new URL(url).hostname.replace("www.", "");
    const normalizedDomain = domain.replace("www.", "");

    return host === normalizedDomain || host.endsWith(`.${normalizedDomain}`);
  } catch {
    return false;
  }
}

function isExcludedByResultType(resultType: SearchResultType): boolean {
  return (
    resultType === "BLOG_PAGE" ||
    resultType === "DOCUMENTATION_PAGE" ||
    resultType === "UNKNOWN"
  );
}

async function fetchGoogleImageFallback({
  title,
  supplierName,
  domain,
  source,
  apiKey,
}: {
  title: string;
  supplierName: string;
  domain: string;
  source: SupplierProductSource;
  apiKey: string;
}): Promise<string | null> {
  try {
    const query = `${title} ${supplierName}`;
    const url = `https://serpapi.com/search.json?engine=google_images&q=${encodeURIComponent(query)}&api_key=${apiKey}`;
    const res = await cachedSerpFetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const images = data.images_results || [];
    const normalizedDomain = domain.toLowerCase().replace(/^www\./, "");
    const domainRoot = normalizedDomain.split(".")[0] || normalizedDomain;

    for (const img of images) {
      const src = String(img.source || "").toLowerCase();
      const imageUrl = img.original || img.thumbnail || null;
      if (!imageUrl) continue;

      // Primary gate: image source must match the supplier domain/brand.
      let matchesDomain = false;
      if (src) {
        matchesDomain =
          src.includes(normalizedDomain) ||
          (domainRoot.length > 2 && src.includes(domainRoot));
        if (!matchesDomain) {
          try {
            const host = new URL(src).hostname.toLowerCase().replace(/^www\./, "");
            matchesDomain =
              host === normalizedDomain || host.endsWith(`.${normalizedDomain}`);
          } catch {
            // keep string-based match result
          }
        }
      }
      if (matchesDomain) return imageUrl;

      // Keep existing stricter supplier-specific checks as fallback.
      if (source === "FERGUSON" && src.includes("ferguson")) return imageUrl;
      if (source === "GRAINGER" && src.includes("grainger")) return imageUrl;
    }

    return null;
  } catch {
    return null;
  }
}

function findMatchingImage(title: string, inlineImages: SerpInlineImage[]): string | null {
  const t = title.toLowerCase();
  if (!t) return null;

  for (const img of inlineImages) {
    const imgTitle = (img.title || "").toLowerCase();

    if (!imgTitle) continue;

    // simple fuzzy match
    if (t.includes(imgTitle.slice(0, 20)) || imgTitle.includes(t.slice(0, 20))) {
      return img.original || img.thumbnail || null;
    }
  }

  return null;
}

function findShoppingImage(title: string, shoppingResults: SerpShoppingResult[]): string | null {
  const t = title.toLowerCase();
  if (!t) return null;

  for (const item of shoppingResults) {
    const sTitle = (item.title || "").toLowerCase();
    const sSource = (item.source || "").toLowerCase();

    if (!sTitle) continue;

    if (
      (t.includes(sTitle.slice(0, 20)) || sTitle.includes(t.slice(0, 20))) &&
      sSource.includes("grainger")
    ) {
      return item.thumbnail || null;
    }
  }

  return null;
}

function normalizeImgSrc(src: string, pageUrl: string): string {
  let u = src.trim();
  if (u.startsWith("//")) return `https:${u}`;
  if (u.startsWith("/")) return new URL(u, pageUrl).toString();
  return u;
}

/**
 * Parse `<img>` tags whose `class` contains `wp-post-image`; returns resolved src + alt.
 */
function parseWpPostImagesFromHtml(
  html: string,
  pageUrl: string,
): { src: string; alt: string | null }[] {
  const results: { src: string; alt: string | null }[] = [];
  const imgTagRe = /<img\b[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = imgTagRe.exec(html)) !== null) {
    const tag = m[0];
    const classMatch = tag.match(/\bclass\s*=\s*(["'])([^"']*)\1/i);
    const classVal = classMatch?.[2] ?? "";
    if (!classVal.includes("wp-post-image")) continue;

    const srcMatch = tag.match(/\bsrc\s*=\s*(["'])([^"']+)\1/i);
    if (!srcMatch?.[2]) continue;

    const src = normalizeImgSrc(srcMatch[2], pageUrl);
    const altMatch = tag.match(/\balt\s*=\s*(["'])([^"']*)\1/i);
    const alt = altMatch?.[2]?.trim() ? altMatch[2].trim() : null;

    results.push({ src, alt });
  }
  return results;
}

async function fetchPageHtml(pageUrl: string): Promise<string | null> {
  const fetched = await fetchSupplierPageHtml(pageUrl);
  return fetched?.html ?? null;
}

async function extractAbcSupplyWpPostImages(
  pageUrl: string,
): Promise<{ src: string; alt: string | null }[]> {
  const html = await fetchPageHtml(pageUrl);
  if (!html) return [];
  return parseWpPostImagesFromHtml(html, pageUrl);
}

type PerItemRows = {
  mapped: SupplierProductResult[];
  productResults: SupplierProductResult[];
  categoryResults: SupplierProductResult[];
  brandResults: SupplierProductResult[];
  otherResults: SupplierProductResult[];
};

const EMPTY_STRUCTURED: SupplierSiteSearchStructured = {
  products: [],
  categories: [],
  brands: [],
  other: [],
  flat: [],
};

/**
 * SerpAPI Google organic search with structured page-type buckets.
 * `flat` is identical to legacy `searchSupplierSite()` output.
 */
export async function searchSupplierSiteStructured(
  params: SearchSupplierSiteParams
): Promise<SupplierSiteSearchStructured> {
  const q = params.query.trim();
  if (!q) return { ...EMPTY_STRUCTURED };

  const apiKey = getSerpApiKey();
  const qParam = `site:${params.domain} ${q}`;
  const url = `https://serpapi.com/search.json?engine=google&q=${encodeURIComponent(qParam)}&api_key=${apiKey}`;

  try {
    const res = await cachedSerpFetch(url);
    const data = await res.json();

    const organicRaw = (data.organic_results || []).slice(0, 20) as SerpOrganicItem[];

    const organic = rankOrganicCandidates(
      organicRaw
        .filter((item) => item.link && isSameDomain(item.link, params.domain))
        .map((item) => ({
          link: item.link!,
          title: item.title,
          thumbnail: item.thumbnail,
          query: q,
          domain: params.domain,
        }))
    );
    const inlineImages: SerpInlineImage[] = data.inline_images || [];
    const shoppingResults: SerpShoppingResult[] = data.shopping_results || [];

    const mapped: SupplierProductResult[] = [];
    const productResults: SupplierProductResult[] = [];
    const categoryResults: SupplierProductResult[] = [];
    const brandResults: SupplierProductResult[] = [];
    const otherResults: SupplierProductResult[] = [];

    let pageImageFetchAttempts = 0;

    const processItem = async (
      item: ScoredOrganicCandidate,
      rankIndex: number
    ): Promise<PerItemRows> => {
      const out: PerItemRows = {
        mapped: [],
        productResults: [],
        categoryResults: [],
        brandResults: [],
        otherResults: [],
      };
      const link = item.link;
      if (!link || !isSameDomain(link, params.domain)) return out;
      const resultType = item.resultType;
      if (isExcludedByResultType(resultType)) return out;

      const isProduct = resultType === "PRODUCT_PAGE";
      const isCategory =
        !isProduct &&
        (resultType === "CATEGORY_PAGE" || resultType === "SEARCH_PAGE");
      const isBrand = !isProduct && !isCategory && resultType === "BRAND_PAGE";

      const organicTitle = item.title || q;

      if (params.extractImagesFromPage === true && params.source === "ABC_SUPPLY") {
        const wpImages = await extractAbcSupplyWpPostImages(link);
        if (wpImages.length > 0) {
          for (const { src, alt } of wpImages) {
            if (!src) continue;
            const title = alt ?? organicTitle;
            for (const supplierId of params.supplierIds) {
              const row: SupplierProductResult = {
                supplierId,
                title,
                brand: null,
                imageUrl: src,
                price: null,
                availability: "Found on supplier site",
                productUrl: link,
                source: params.source,
                classification: resultType,
              };
              out.mapped.push(row);
              out.productResults.push(row);
            }
          }
          return out;
        }
      }

      const allowDeepFetch = rankIndex <= MAX_PAGE_IMAGE_FETCH_ATTEMPTS;

      let imageUrl =
        item.thumbnail ??
        findMatchingImage(organicTitle, inlineImages) ??
        findShoppingImage(organicTitle, shoppingResults) ??
        null;

      if (!imageUrl && allowDeepFetch) {
        pageImageFetchAttempts += 1;
        imageUrl = await resolvePageImageUrl(link);
      }

      if (!imageUrl && allowDeepFetch) {
        imageUrl = await fetchGoogleImageFallback({
          title: organicTitle,
          supplierName: params.logLabel,
          domain: params.domain,
          source: params.source,
          apiKey,
        });
      }
      if (!imageUrl) return out;

      for (const supplierId of params.supplierIds) {
        const row: SupplierProductResult = {
          supplierId,
          title: organicTitle,
          brand: null,
          imageUrl,
          price: null,
          availability: "Found on supplier site",
          productUrl: link,
          source: params.source,
          classification: resultType,
        };
        out.mapped.push(row);
        if (isProduct) {
          out.productResults.push(row);
        } else if (isCategory) {
          out.categoryResults.push(row);
        } else if (isBrand) {
          out.brandResults.push(row);
        } else {
          out.otherResults.push(row);
        }
      }
      return out;
    };

    const maxOrganicHits =
      params.maxOrganicHits ?? STOREFRONT_SITE_ORGANIC_MAX_HITS;
    const minProductTarget =
      params.minProductTarget ?? STOREFRONT_DEFAULT_NUM_RESULTS;

    for (let index = 0; index < organic.length && index < maxOrganicHits; index++) {
      const r = await processItem(organic[index]!, index + 1);
      mapped.push(...r.mapped);
      productResults.push(...r.productResults);
      categoryResults.push(...r.categoryResults);
      brandResults.push(...r.brandResults);
      otherResults.push(...r.otherResults);
      if (productResults.length >= minProductTarget) break;
    }

    const flat = mergeSupplierSiteSearchFlatRows(
      productResults,
      categoryResults,
      mapped,
      q
    );

    if (flat.length === 0) {
      return { ...EMPTY_STRUCTURED };
    }

    return {
      products: dedupeSupplierSiteRows(productResults),
      categories: dedupeSupplierSiteRows(categoryResults),
      brands: dedupeSupplierSiteRows(brandResults),
      other: dedupeSupplierSiteRows(otherResults),
      flat,
    };
  } catch (err) {
    console.error(`SerpApi ${params.logLabel} site search failed:`, err);
    return { ...EMPTY_STRUCTURED };
  }
}

/**
 * SerpAPI Google organic search restricted to a supplier domain (`site:domain query`).
 */
export async function searchSupplierSite(
  params: SearchSupplierSiteParams
): Promise<SupplierProductResult[]> {
  const structured = await searchSupplierSiteStructured(params);
  return structured.flat;
}
