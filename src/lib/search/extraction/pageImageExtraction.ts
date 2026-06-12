import { decodeHtmlEntities } from "@/lib/suppliers/schema/decodeHtmlEntities";
import {
  extractJsonLdBlocks,
  jsonLdContainsProduct,
} from "@/lib/suppliers/schema/sitemapParse";

export type PageImageSource =
  | "json_ld"
  | "og_image"
  | "twitter_image"
  | "meta_itemprop"
  | "link_image_src"
  | "dom";

export type PageImageCandidate = {
  url: string;
  source: PageImageSource;
  score: number;
};

export type PageImageExtractionResult = {
  imageUrl: string;
  source: PageImageSource;
};

const PAGE_FETCH_USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
] as const;

const REJECTED_IMAGE_PATH =
  /(?:^|[\/_-])(?:logo|logotype|icon|sprite|spacer|pixel|blank|avatar|badge|flag|payment|social|facebook|twitter|instagram|linkedin|youtube|favicon)(?:[\/_.-]|$)/i;

const REJECTED_IMAGE_HOST =
  /(?:^|\.)((?:gravatar|facebook|twitter|instagram|linkedin|youtube)\.com|twimg\.com)$/i;

export function resolveAbsolutePageUrl(raw: string, pageUrl: string): string | null {
  const trimmed = decodeHtmlEntities(raw.trim());
  if (!trimmed) return null;
  if (trimmed.startsWith("data:")) return null;

  let resolved = trimmed;
  if (resolved.startsWith("//")) {
    resolved = `https:${resolved}`;
  } else if (resolved.startsWith("/")) {
    try {
      resolved = new URL(resolved, pageUrl).toString();
    } catch {
      return null;
    }
  } else if (!/^https?:\/\//i.test(resolved)) {
    try {
      resolved = new URL(resolved, pageUrl).toString();
    } catch {
      return null;
    }
  }

  if (!/^https:\/\//i.test(resolved)) return null;

  try {
    const parsed = new URL(resolved);
    if (parsed.protocol !== "https:") return null;
    if (REJECTED_IMAGE_HOST.test(parsed.hostname)) return null;
    if (REJECTED_IMAGE_PATH.test(parsed.pathname)) return null;
    if (/placeholder|1x1|spacer|tracking|analytics|doubleclick|pixel/i.test(resolved)) {
      return null;
    }
    if (/\.svg(?:$|[?#])/i.test(parsed.pathname)) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function parseMetaTagAttributes(tagInner: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const attrRe = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(["'])(.*?)\2/g;
  let match: RegExpExecArray | null;
  while ((match = attrRe.exec(tagInner)) !== null) {
    const key = match[1]?.toLowerCase();
    const value = match[3];
    if (key && value != null) {
      attrs[key] = decodeHtmlEntities(value);
    }
  }
  return attrs;
}

function pushCandidate(
  out: PageImageCandidate[],
  raw: string | null | undefined,
  pageUrl: string,
  source: PageImageSource,
  score: number
) {
  if (!raw) return;
  const url = resolveAbsolutePageUrl(raw, pageUrl);
  if (!url) return;
  out.push({ url, source, score });
}

export function extractMetaImageCandidates(
  html: string,
  pageUrl: string
): PageImageCandidate[] {
  const candidates: PageImageCandidate[] = [];
  const metaRe = /<meta\b([^>]*)\/?>/gi;
  let match: RegExpExecArray | null;

  while ((match = metaRe.exec(html)) !== null) {
    const attrs = parseMetaTagAttributes(match[1] ?? "");
    const property = attrs.property?.toLowerCase() ?? "";
    const name = attrs.name?.toLowerCase() ?? "";
    const itemprop = attrs.itemprop?.toLowerCase() ?? "";
    const content = attrs.content;

    if (
      property === "og:image" ||
      property === "og:image:secure_url" ||
      property === "og:image:url" ||
      name === "og:image"
    ) {
      pushCandidate(candidates, content, pageUrl, "og_image", 100);
      continue;
    }

    if (
      name === "twitter:image" ||
      name === "twitter:image:src" ||
      property === "twitter:image"
    ) {
      pushCandidate(candidates, content, pageUrl, "twitter_image", 95);
      continue;
    }

    if (itemprop === "image") {
      pushCandidate(candidates, content, pageUrl, "meta_itemprop", 90);
    }
  }

  const linkRe = /<link\b([^>]*)\/?>/gi;
  while ((match = linkRe.exec(html)) !== null) {
    const attrs = parseMetaTagAttributes(match[1] ?? "");
    const rel = attrs.rel?.toLowerCase() ?? "";
    if (rel === "image_src" || rel === "thumbnail") {
      pushCandidate(candidates, attrs.href, pageUrl, "link_image_src", 85);
    }
  }

  return candidates;
}

function findProductNode(data: unknown): Record<string, unknown> | null {
  if (data == null) return null;
  if (Array.isArray(data)) {
    for (const entry of data) {
      const found = findProductNode(entry);
      if (found) return found;
    }
    return null;
  }
  if (typeof data !== "object") return null;

  const obj = data as Record<string, unknown>;
  const type = obj["@type"];
  const types = Array.isArray(type) ? type : type ? [type] : [];
  if (types.includes("Product") || types.includes("ProductGroup")) return obj;
  if (obj["@graph"]) return findProductNode(obj["@graph"]);
  return null;
}

function flattenJsonLdImageValue(value: unknown): string[] {
  if (typeof value === "string" && value.trim()) return [value.trim()];
  if (Array.isArray(value)) {
    return value.flatMap((entry) => flattenJsonLdImageValue(entry));
  }
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if (typeof obj.url === "string" && obj.url.trim()) return [obj.url.trim()];
    if (typeof obj.contentUrl === "string" && obj.contentUrl.trim()) {
      return [obj.contentUrl.trim()];
    }
    if (obj["@graph"]) return flattenJsonLdImageValue(obj["@graph"]);
  }
  return [];
}

export function readJsonLdImageFromProduct(
  product: Record<string, unknown>,
  pageUrl: string
): string | null {
  for (const value of collectJsonLdImageValues(product)) {
    for (const raw of flattenJsonLdImageValue(value)) {
      const url = resolveAbsolutePageUrl(raw, pageUrl);
      if (url) return url;
    }
  }
  return null;
}

function collectJsonLdImageValues(product: Record<string, unknown>): unknown[] {
  const values: unknown[] = [];
  for (const key of ["image", "images", "photo", "thumbnailUrl", "primaryImageOfPage"]) {
    const value = product[key];
    if (value != null) values.push(value);
  }
  return values;
}

export function extractJsonLdProductImageCandidates(
  html: string,
  pageUrl: string
): PageImageCandidate[] {
  const candidates: PageImageCandidate[] = [];

  for (const block of extractJsonLdBlocks(html)) {
    if (!jsonLdContainsProduct(block)) continue;
    const product = findProductNode(block);
    if (!product) continue;

    for (const value of collectJsonLdImageValues(product)) {
      for (const raw of flattenJsonLdImageValue(value)) {
        pushCandidate(candidates, raw, pageUrl, "json_ld", 110);
      }
    }
  }

  return candidates;
}

function pageHostRoot(pageUrl: string): string | null {
  try {
    const host = new URL(pageUrl).hostname.replace(/^www\./, "").toLowerCase();
    const parts = host.split(".");
    if (parts.length >= 2) return parts.slice(-2).join(".");
    return host;
  } catch {
    return null;
  }
}

export function isSupplierOwnedImageUrl(
  imageUrl: string,
  pageUrl: string,
  strictDomMatch = false
): boolean {
  try {
    const imageHost = new URL(imageUrl).hostname.replace(/^www\./, "").toLowerCase();
    const pageHost = new URL(pageUrl).hostname.replace(/^www\./, "").toLowerCase();
    const root = pageHostRoot(pageUrl);

    if (imageHost === pageHost) return true;
    if (imageHost.endsWith(`.${pageHost}`)) return true;
    if (root && (imageHost === root || imageHost.endsWith(`.${root}`))) return true;

    if (strictDomMatch) return false;

    return !REJECTED_IMAGE_HOST.test(imageHost);
  } catch {
    return false;
  }
}

function scoreDomImageTag(tag: string, src: string): number {
  const lowerTag = tag.toLowerCase();
  const lowerSrc = src.toLowerCase();
  let score = 10;

  if (/product|sku|item|catalog|thumbnail|wp-post-image|attachment|gallery/i.test(lowerTag)) {
    score += 50;
  }
  if (/class=["'][^"']*(product|item|catalog|thumbnail|card)/i.test(lowerTag)) {
    score += 35;
  }
  if (/data-product|data-sku|data-image/i.test(lowerTag)) score += 25;
  if (/loading=["']lazy["']/i.test(lowerTag)) score += 5;

  if (/logo|icon|sprite|banner|avatar|social|nav|header|footer|menu|badge|payment|cart|search|profile|user|star-rating|rating|svg/i.test(lowerTag)) {
    score -= 100;
  }
  if (/logo|icon|sprite|banner|avatar|social|placeholder|1x1|pixel|spacer|blank|favicon/i.test(lowerSrc)) {
    score -= 100;
  }
  if (/width=["']?(?:[1-9]|1[0-9]|2[0-9])["']?/i.test(lowerTag)) score -= 40;
  if (/\d{3,4}x\d{3,4}/.test(lowerSrc)) score += 8;

  return score;
}

export function extractDomProductImageCandidates(
  html: string,
  pageUrl: string
): PageImageCandidate[] {
  const candidates: PageImageCandidate[] = [];
  const imgTagRe = /<img\b[^>]*>/gi;
  let match: RegExpExecArray | null;

  while ((match = imgTagRe.exec(html)) !== null) {
    const tag = match[0];
    const srcMatch =
      tag.match(/\bsrc\s*=\s*(["'])([^"']+)\1/i) ??
      tag.match(/\bdata-src\s*=\s*(["'])([^"']+)\1/i) ??
      tag.match(/\bdata-lazy-src\s*=\s*(["'])([^"']+)\1/i);
    const rawSrc = srcMatch?.[2];
    if (!rawSrc) continue;

    const score = scoreDomImageTag(tag, rawSrc);
    if (score < 0) continue;

    const url = resolveAbsolutePageUrl(rawSrc, pageUrl);
    if (!url || !isSupplierOwnedImageUrl(url, pageUrl, true)) continue;

    candidates.push({ url, source: "dom", score: 40 + score });
  }

  return candidates;
}

function pickBestPageImageCandidate(
  candidates: PageImageCandidate[],
  pageUrl: string
): PageImageExtractionResult | null {
  const ranked = [...candidates].sort((a, b) => b.score - a.score);
  const seen = new Set<string>();

  for (const candidate of ranked) {
    if (seen.has(candidate.url)) continue;
    seen.add(candidate.url);

    const strictDom = candidate.source === "dom";
    if (!isSupplierOwnedImageUrl(candidate.url, pageUrl, strictDom)) continue;

    return { imageUrl: candidate.url, source: candidate.source };
  }

  return null;
}

export function extractPageImageFromHtml(
  html: string,
  pageUrl: string
): PageImageExtractionResult | null {
  if (!html.trim()) return null;

  const candidates = [
    ...extractJsonLdProductImageCandidates(html, pageUrl),
    ...extractMetaImageCandidates(html, pageUrl),
    ...extractDomProductImageCandidates(html, pageUrl),
  ];

  return pickBestPageImageCandidate(candidates, pageUrl);
}

export async function fetchSupplierPageHtml(
  pageUrl: string
): Promise<{ status: number; html: string } | null> {
  for (let attempt = 0; attempt < PAGE_FETCH_USER_AGENTS.length; attempt += 1) {
    const userAgent = PAGE_FETCH_USER_AGENTS[attempt]!;
    try {
      const res = await fetch(pageUrl, {
        redirect: "follow",
        headers: {
          "User-Agent": userAgent,
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
        },
        signal: AbortSignal.timeout(15_000),
      });

      if ((res.status === 403 || res.status === 401) && attempt < PAGE_FETCH_USER_AGENTS.length - 1) {
        continue;
      }
      if (!res.ok) {
        if (res.status >= 500 && attempt < PAGE_FETCH_USER_AGENTS.length - 1) {
          continue;
        }
        return null;
      }

      return { status: res.status, html: await res.text() };
    } catch {
      if (attempt < PAGE_FETCH_USER_AGENTS.length - 1) continue;
    }
  }

  return null;
}

export async function resolvePageImageUrl(pageUrl: string): Promise<string | null> {
  const fetched = await fetchSupplierPageHtml(pageUrl);
  if (!fetched?.html) return null;
  return extractPageImageFromHtml(fetched.html, pageUrl)?.imageUrl ?? null;
}

export const PAGE_IMAGE_PIPELINE_ORDER = [
  "serp_organic_thumbnail",
  "inline_image_matching",
  "shopping_image_matching",
  "json_ld_product_image",
  "og_image / twitter:image / itemprop",
  "dom_product_image_fallback",
  "google_image_fallback",
] as const;
