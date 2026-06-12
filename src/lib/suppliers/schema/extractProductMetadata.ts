import { decodeHtmlEntities } from "./decodeHtmlEntities";
import {
  extractMetaImageCandidates,
  readJsonLdImageFromProduct,
  resolveAbsolutePageUrl,
} from "@/lib/search/extraction/pageImageExtraction";
import {
  extractJsonLdBlocks,
  jsonLdContainsProduct,
} from "./sitemapParse";

export type ExtractedProductMetadata = {
  title: string;
  productUrl: string;
  imageUrl?: string | null;
  brand?: string | null;
};

export function extractMetaContentByAttr(
  html: string,
  attrName: "property" | "name",
  attrValue: string
): string | null {
  const esc = attrValue.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const attrFirst = new RegExp(
    `<meta\\s[^>]*${attrName}=["']${esc}["'][^>]*content=["']([^"']+)["']`,
    "i"
  );
  const m1 = html.match(attrFirst);
  if (m1?.[1]) return m1[1];

  const contentFirst = new RegExp(
    `<meta\\s[^>]*content=["']([^"']+)["'][^>]*${attrName}=["']${esc}["']`,
    "i"
  );
  const m2 = html.match(contentFirst);
  return m2?.[1] ?? null;
}

function resolveAbsoluteUrl(raw: string, pageUrl: string): string {
  return resolveAbsolutePageUrl(raw, pageUrl) ?? raw.trim();
}

function readJsonLdBrand(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if (typeof obj.name === "string" && obj.name.trim()) return obj.name.trim();
  }
  return null;
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
  if (type === "Product") return obj;
  if (Array.isArray(type) && type.includes("Product")) return obj;
  if (obj["@graph"]) return findProductNode(obj["@graph"]);
  return null;
}

export function extractProductFromJsonLd(
  html: string,
  pageUrl: string
): ExtractedProductMetadata | null {
  for (const block of extractJsonLdBlocks(html)) {
    if (!jsonLdContainsProduct(block)) continue;
    const product = findProductNode(block);
    if (!product) continue;

    const name = typeof product.name === "string" ? product.name.trim() : "";
    if (!name) continue;

    const url =
      typeof product.url === "string" && product.url.trim()
        ? resolveAbsoluteUrl(product.url.trim(), pageUrl)
        : pageUrl;

    const imageUrl = readJsonLdImageFromProduct(product, pageUrl);
    const brand = readJsonLdBrand(product.brand);

    return {
      title: decodeHtmlEntities(name),
      productUrl: url,
      imageUrl,
      brand,
    };
  }
  return null;
}

function normalizeExtractedTitle(title: string): string {
  return decodeHtmlEntities(title.trim());
}

function extractHtmlTitle(html: string): string | null {
  const ogTitle = extractMetaContentByAttr(html, "property", "og:title");
  if (ogTitle?.trim()) return normalizeExtractedTitle(ogTitle);

  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleMatch?.[1]?.trim()) return normalizeExtractedTitle(titleMatch[1]);

  const h1Match = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
  if (h1Match?.[1]?.trim()) return normalizeExtractedTitle(h1Match[1]);

  return null;
}

function extractHtmlImage(html: string, pageUrl: string): string | null {
  const metaCandidates = extractMetaImageCandidates(html, pageUrl);
  const best = [...metaCandidates].sort((a, b) => b.score - a.score)[0];
  return best?.url ?? null;
}

export function extractProductFromHtml(
  html: string,
  pageUrl: string,
  preferSchema = false
): ExtractedProductMetadata | null {
  if (preferSchema) {
    const fromSchema = extractProductFromJsonLd(html, pageUrl);
    if (fromSchema) return fromSchema;
  }

  const title = extractHtmlTitle(html);
  if (!title) {
    if (!preferSchema) {
      return extractProductFromJsonLd(html, pageUrl);
    }
    return null;
  }

  const imageUrl = extractHtmlImage(html, pageUrl);
  const schemaBrand = extractProductFromJsonLd(html, pageUrl)?.brand ?? null;

  return {
    title,
    productUrl: pageUrl,
    imageUrl,
    brand: schemaBrand,
  };
}
