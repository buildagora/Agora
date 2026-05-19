import { getSerpApiKey } from "@/lib/config/env";
import { classifyUrl } from "@/lib/search/classification/classifyUrl";
import type { SearchResultType } from "@/lib/search/classification/resultTypes";
import { rankOrganicResults } from "@/lib/search/organic/rankOrganicResults";
import { cachedSerpFetch } from "@/lib/serpCache/server";
import type { SupplierProductResult, SupplierProductSource } from "./types";

export type SearchSupplierSiteParams = {
  query: string;
  domain: string;
  supplierIds: string[];
  source: SupplierProductSource;
  logLabel: string;
  /** When true with ABC_SUPPLY, fetches pages and uses WordPress `wp-post-image` imgs only (no og/twitter). */
  extractImagesFromPage?: boolean;
};

const PAGE_FETCH_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

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

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractMetaContentByAttr(
  html: string,
  attrName: "property" | "name",
  attrValue: string,
): string | null {
  const esc = escapeRegExp(attrValue);
  const propFirst = new RegExp(
    `<meta\\s[^>]*${attrName}=["']${esc}["'][^>]*content=["']([^"']+)["']`,
    "i",
  );
  const m1 = html.match(propFirst);
  if (m1?.[1]) return m1[1];

  const contentFirst = new RegExp(
    `<meta\\s[^>]*content=["']([^"']+)["'][^>]*${attrName}=["']${esc}["']`,
    "i",
  );
  const m2 = html.match(contentFirst);
  return m2?.[1] ?? null;
}

async function extractPageImageUrl(pageUrl: string): Promise<string | null> {
  try {
    const res = await fetch(pageUrl, {
      headers: {
        "User-Agent": PAGE_FETCH_USER_AGENT,
      },
    });
    if (!res.ok) return null;
    const html = await res.text();

    const raw =
      extractMetaContentByAttr(html, "property", "og:image") ??
      extractMetaContentByAttr(html, "name", "twitter:image") ??
      extractMetaContentByAttr(html, "property", "og:image:secure_url");
    if (!raw) return null;

    let imageUrl = raw.trim();
    if (imageUrl.startsWith("//")) {
      imageUrl = `https:${imageUrl}`;
    } else if (imageUrl.startsWith("/")) {
      imageUrl = new URL(imageUrl, pageUrl).toString();
    }
    return imageUrl;
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

function normalizeTitleForDedupe(title: string | null | undefined): string {
  return String(title || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
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
  try {
    const res = await fetch(pageUrl, {
      headers: {
        "User-Agent": PAGE_FETCH_USER_AGENT,
      },
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

async function extractAbcSupplyWpPostImages(
  pageUrl: string,
): Promise<{ src: string; alt: string | null }[]> {
  const html = await fetchPageHtml(pageUrl);
  if (!html) return [];
  return parseWpPostImagesFromHtml(html, pageUrl);
}

/**
 * SerpAPI Google organic search restricted to a supplier domain (`site:domain query`).
 */
export async function searchSupplierSite({
  query,
  domain,
  supplierIds,
  source,
  logLabel,
  extractImagesFromPage,
}: SearchSupplierSiteParams): Promise<SupplierProductResult[]> {
  const q = query.trim();
  if (!q) return [];

  const apiKey = getSerpApiKey();
  const qParam = `site:${domain} ${q}`;
  const url = `https://serpapi.com/search.json?engine=google&q=${encodeURIComponent(qParam)}&api_key=${apiKey}`;

  try {
    const res = await cachedSerpFetch(url);
    const data = await res.json();

    const organicRaw = (data.organic_results || []).slice(0, 20);

    const organic = organicRaw.filter((item: any) => {
      if (!item.link) return false;
      return isSameDomain(item.link, domain);
    });
    const inlineImages: SerpInlineImage[] = data.inline_images || [];
    const shoppingResults: SerpShoppingResult[] = data.shopping_results || [];

    const mapped: SupplierProductResult[] = [];
    const productResults: SupplierProductResult[] = [];
    const categoryResults: SupplierProductResult[] = [];

    // Each organic result independently may require 1-3 network calls
    // (page-HTML fetch + Google image fallback). Run all of them in
    // parallel, then merge results in original order. Cache hits return
    // instantly so this only matters on first-uncached query. Cuts wall
    // time on cold queries from ~5-15s to ~2-4s.
    type PerItemRows = {
      mapped: SupplierProductResult[];
      productResults: SupplierProductResult[];
      categoryResults: SupplierProductResult[];
    };

    const processItem = async (item: any): Promise<PerItemRows> => {
      const out: PerItemRows = { mapped: [], productResults: [], categoryResults: [] };
      const link = item.link;
      if (!isSameDomain(link, domain)) return out;
      const resultType = classifyUrl(link);
      if (isExcludedByResultType(resultType)) return out;

      const isProduct = resultType === "PRODUCT_PAGE";
      const isCategory =
        !isProduct &&
        (resultType === "CATEGORY_PAGE" || resultType === "SEARCH_PAGE");

      const organicTitle = item.title || q;

      if (extractImagesFromPage === true && source === "ABC_SUPPLY") {
        const wpImages = await extractAbcSupplyWpPostImages(link);
        if (wpImages.length > 0) {
          for (const { src, alt } of wpImages) {
            if (!src) continue;
            const title = alt ?? organicTitle;
            for (const supplierId of supplierIds) {
              const row: SupplierProductResult = {
                supplierId,
                title,
                brand: null,
                imageUrl: src,
                price: null,
                availability: "Found on supplier site",
                productUrl: link,
                source,
                classification: resultType,
              };
              out.mapped.push(row);
              out.productResults.push(row);
            }
          }
          return out;
        }
      }

      let imageUrl =
        item.thumbnail ??
        findMatchingImage(organicTitle, inlineImages) ??
        findShoppingImage(organicTitle, shoppingResults) ??
        (await extractPageImageUrl(link));
      if (!imageUrl) {
        imageUrl = await fetchGoogleImageFallback({
          title: organicTitle,
          supplierName: logLabel,
          domain,
          source,
          apiKey,
        });
      }
      if (!imageUrl) return out;

      for (const supplierId of supplierIds) {
        const row: SupplierProductResult = {
          supplierId,
          title: organicTitle,
          brand: null,
          imageUrl,
          price: null,
          availability: "Found on supplier site",
          productUrl: link,
          source,
          classification: resultType,
        };
        out.mapped.push(row);
        if (isProduct) {
          out.productResults.push(row);
        } else if (isCategory) {
          out.categoryResults.push(row);
        }
      }
      return out;
    };

    const perItemResults = await Promise.all(organic.map(processItem));
    for (const r of perItemResults) {
      mapped.push(...r.mapped);
      productResults.push(...r.productResults);
      categoryResults.push(...r.categoryResults);
    }

    const rowDedupeKey = (row: SupplierProductResult) =>
      `${row.supplierId}|${normalizeTitleForDedupe(row.title)}|${row.productUrl ?? ""}`;

    const mergeSeen = new Set<string>();
    const baseRowsRaw: SupplierProductResult[] = [];
    for (const row of productResults) {
      const k = rowDedupeKey(row);
      if (mergeSeen.has(k)) continue;
      mergeSeen.add(k);
      baseRowsRaw.push(row);
    }
    for (const row of categoryResults) {
      const k = rowDedupeKey(row);
      if (mergeSeen.has(k)) continue;
      mergeSeen.add(k);
      baseRowsRaw.push(row);
    }
    for (const row of mapped) {
      const k = rowDedupeKey(row);
      if (mergeSeen.has(k)) continue;
      mergeSeen.add(k);
      baseRowsRaw.push(row);
    }

    const baseRows = rankOrganicResults(baseRowsRaw, q);
    const deduped: SupplierProductResult[] = [];
    const seen = new Set<string>();
    for (const row of baseRows) {
      const key = `${row.supplierId}|${normalizeTitleForDedupe(row.title)}|${row.productUrl ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(row);
    }

    if (deduped.length === 0) {
      return [];
    }

    return deduped;
  } catch (err) {
    console.error(`SerpApi ${logLabel} site search failed:`, err);
    return [];
  }
}
