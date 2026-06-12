import { decodeHtmlEntities } from "../schema/decodeHtmlEntities";
import { resolveAbsolutePageUrl } from "@/lib/search/extraction/pageImageExtraction";
import type { ExtractedProductMetadata } from "../schema/extractProductMetadata";

function stripHtmlTags(value: string): string {
  return decodeHtmlEntities(value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

function resolveListingUrl(raw: string, pageUrl: string): string | null {
  return resolveAbsolutePageUrl(raw, pageUrl);
}

/**
 * Extract product cards from catalog/listing pages (e.g. ESC Supply `.product-item` grids).
 */
export function extractListingProductsFromHtml(
  html: string,
  pageUrl: string
): ExtractedProductMetadata[] {
  const results: ExtractedProductMetadata[] = [];
  const seen = new Set<string>();

  const chunks = html.split(/<div class="product-item">/i).slice(1);

  for (const chunk of chunks) {
    const block = chunk.split(/<\/div>\s*<\/div>\s*<\/div>/i)[0] ?? "";
    if (!block.trim()) continue;

    const linkMatch = block.match(
      /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i
    );
    const href = linkMatch?.[1]?.trim();
    if (!href || href.startsWith("javascript:")) continue;

    const productUrl = resolveListingUrl(href, pageUrl);
    if (!productUrl || seen.has(productUrl)) continue;

    const imgMatch = block.match(/<img\b[^>]*>/i);
    const imgTag = imgMatch?.[0] ?? "";
    const srcMatch = imgTag.match(/\bsrc=["']([^"']+)["']/i);
    const titleAttrMatch = imgTag.match(/\btitle=["']([^"']+)["']/i);
    const imageUrl = srcMatch?.[1]
      ? resolveListingUrl(srcMatch[1], pageUrl)
      : null;
    if (!imageUrl) continue;

    const anchorText = linkMatch?.[2] ? stripHtmlTags(linkMatch[2]) : "";
    const title =
      anchorText ||
      (titleAttrMatch?.[1] ? decodeHtmlEntities(titleAttrMatch[1].trim()) : "");
    if (!title) continue;

    seen.add(productUrl);
    results.push({
      title,
      productUrl,
      imageUrl,
      brand: null,
    });
  }

  return results;
}