import type { SearchResultType } from "@/lib/search/classification/resultTypes";
import { classifyUrl } from "@/lib/search/classification/classifyUrl";

export function parseRobotsSitemapUrls(robotsTxt: string): string[] {
  const urls: string[] = [];
  for (const line of robotsTxt.split("\n")) {
    const trimmed = line.trim();
    const match = trimmed.match(/^sitemap:\s*(.+)$/i);
    if (match?.[1]) urls.push(match[1].trim());
  }
  return [...new Set(urls)];
}

export function parseSitemapLocUrls(xml: string, limit = 500): string[] {
  const urls: string[] = [];
  const locRe = /<loc>\s*([^<\s]+)\s*<\/loc>/gi;
  let match: RegExpExecArray | null;
  while ((match = locRe.exec(xml)) !== null) {
    const loc = match[1]?.trim();
    if (loc) urls.push(loc);
    if (urls.length >= limit) break;
  }
  return urls;
}

export function isSitemapIndex(xml: string): boolean {
  return /<sitemapindex[\s>]/i.test(xml);
}

export function jsonLdContainsProduct(data: unknown): boolean {
  if (data == null) return false;
  if (Array.isArray(data)) return data.some(jsonLdContainsProduct);
  if (typeof data !== "object") return false;

  const obj = data as Record<string, unknown>;
  const type = obj["@type"];
  if (type === "Product") return true;
  if (Array.isArray(type) && type.includes("Product")) return true;
  if (obj["@graph"]) return jsonLdContainsProduct(obj["@graph"]);

  return false;
}

export function extractJsonLdBlocks(html: string): unknown[] {
  const blocks: unknown[] = [];
  const scriptRe =
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = scriptRe.exec(html)) !== null) {
    const raw = match[1]?.trim();
    if (!raw) continue;
    try {
      blocks.push(JSON.parse(raw));
    } catch {
      /* ignore malformed JSON-LD */
    }
  }
  return blocks;
}

export function hasProductJsonLd(html: string): boolean {
  return extractJsonLdBlocks(html).some(jsonLdContainsProduct);
}

export function pickProductCandidateUrls(urls: string[], limit = 3): string[] {
  const productUrls: string[] = [];
  const otherUrls: string[] = [];

  for (const url of urls) {
    if (classifyUrl(url) === "PRODUCT_PAGE") {
      productUrls.push(url);
    } else {
      otherUrls.push(url);
    }
  }

  const ranked = [...productUrls, ...otherUrls];
  return [...new Set(ranked)].slice(0, limit);
}

export function normalizeStoredSitemapUrls(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (entry): entry is string => typeof entry === "string" && entry.trim().length > 0
  );
}

const PRODUCT_SITEMAP_RE = /product|catalog|item/i;

function sitemapCandidatePriority(url: string): number {
  const lower = url.toLowerCase();
  if (lower.endsWith(".gz")) return 0;
  if (/<sitemapindex|sitemap_index|sitemap\.xml/i.test(lower)) return 3;
  if (lower.includes("sitemap")) return 2;
  if (PRODUCT_SITEMAP_RE.test(url)) return 4;
  return 1;
}

/** Prefer sitemap index roots, then product/catalog child sitemaps. */
export function orderSitemapFetchCandidates(storedUrls: string[]): string[] {
  return [...storedUrls].sort(
    (a, b) => sitemapCandidatePriority(b) - sitemapCandidatePriority(a)
  );
}

export function pickChildSitemapUrl(childUrls: string[]): string | null {
  if (childUrls.length === 0) return null;
  const ordered = orderSitemapFetchCandidates(childUrls);
  const pageProducts = ordered.find((url) => /page-sitemap|product-category/i.test(url));
  if (pageProducts) return pageProducts;
  const preferred = ordered.find((url) => PRODUCT_SITEMAP_RE.test(url));
  return preferred ?? ordered[0];
}

const NON_PRODUCT_CLASSIFICATIONS = new Set<SearchResultType>([
  "BLOG_PAGE",
  "DOCUMENTATION_PAGE",
  "PDF_PAGE",
  "HOMEPAGE",
]);

export function isProductDiscoveryUrl(url: string): boolean {
  const classification = classifyUrl(url);
  if (NON_PRODUCT_CLASSIFICATIONS.has(classification)) return false;
  return (
    classification === "PRODUCT_PAGE" ||
    classification === "CATEGORY_PAGE" ||
    classification === "SEARCH_PAGE" ||
    classification === "BRAND_PAGE"
  );
}
