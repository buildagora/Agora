import type { SupplierProductResult, SupplierProductSource } from "../../types";
import type { HybrisPlatformConfig, ParsedHybrisProduct } from "./types";

function resolveAbsoluteUrl(raw: string, siteOrigin: string): string {
  if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;
  const path = raw.startsWith("/") ? raw : `/${raw}`;
  return `${siteOrigin}${path}`;
}

function hiddenValue(block: string, idPattern: RegExp): string | null {
  const match = block.match(idPattern);
  return match?.[1]?.trim() || null;
}

function hiddenInputByClass(block: string, className: string): string | null {
  const patterns = [
    new RegExp(`class="${className}"\\s+value="([^"]*)"`, "i"),
    new RegExp(`value="([^"]*)"\\s+class="${className}"`, "i"),
    new RegExp(`class='${className}'\\s+value='([^']*)'`, "i"),
    new RegExp(`value='([^']*)'\\s+class='${className}'`, "i"),
  ];
  for (const pattern of patterns) {
    const match = block.match(pattern);
    if (match?.[1] != null) return match[1].trim();
  }
  return null;
}

function hiddenInputById(block: string, id: string): string | null {
  const patterns = [
    new RegExp(`id="${id}"\\s+value="([^"]*)"`, "i"),
    new RegExp(`value="([^"]*)"\\s+id="${id}"`, "i"),
    new RegExp(`id='${id}'\\s+value='([^']*)'`, "i"),
    new RegExp(`value='([^']*)'\\s+id='${id}'`, "i"),
  ];
  for (const pattern of patterns) {
    const match = block.match(pattern);
    if (match?.[1] != null) return match[1].trim();
  }
  return null;
}

/** SiteOne Hybris PLP cards: `.product-item[data-product-id]`. */
export function parseSiteoneHybrisHtml(html: string, siteOrigin: string): ParsedHybrisProduct[] {
  const products: ParsedHybrisProduct[] = [];
  const rowPattern =
    /<div class="product-item[\s\S]*?(?=<div class="product-item|$)/gi;
  const rows = html.match(rowPattern) ?? [];

  for (const row of rows) {
    const productIdMatch = row.match(/data-product-id="(\d+)"/i);
    if (!productIdMatch) continue;

    const productId = productIdMatch[1];
    const title =
      hiddenInputById(row, `checkbranch-productname-${productId}`) ||
      hiddenValue(row, new RegExp(`id="ga4-productName"\\s+value="([^"]+)"`, "i")) ||
      hiddenValue(row, new RegExp(`value="([^"]+)"\\s+id="ga4-productName"`, "i"));
    if (!title) continue;

    const hrefMatch = row.match(/<a class="thumb" href="([^"]+)"/i);
    const nameHrefMatch = row.match(/<a class="name linktracking-product" href="([^"]+)"/i);
    const rawUrl = hrefMatch?.[1] || nameHrefMatch?.[1];
    if (!rawUrl || !/\/p\/\d+/.test(rawUrl)) continue;

    const imageRaw =
      hiddenInputById(row, `checkbranch-imgurl-${productId}`) ||
      row.match(/<a class="thumb"[\s\S]*?<img[^>]+src="([^"]+)"/i)?.[1]?.trim() ||
      null;
    const brandRaw =
      hiddenInputByClass(row, `plpProductBrand_${productId}`) ||
      hiddenValue(row, new RegExp(`id="ga4-brandName"\\s+value="([^"]*)"`, "i")) ||
      hiddenValue(row, new RegExp(`value="([^"]*)"\\s+id="ga4-brandName"`, "i"));
    const brand = brandRaw?.trim() || null;
    const price = hiddenValue(row, /class="quoteUom-Price"\s+type="hidden"\s+value='([^']+)'/i);

    products.push({
      title,
      brand: brand || null,
      imageUrl: imageRaw ? resolveAbsoluteUrl(imageRaw, siteOrigin) : null,
      price: price && price !== "0.00" ? price : null,
      productUrl: resolveAbsoluteUrl(rawUrl, siteOrigin),
    });
  }

  return products;
}

/** LennoxPros Hybris PLP cards: `li.item[data-product-id]` with `/p/{id}` links. */
export function parseLennoxHybrisHtml(html: string, siteOrigin: string): ParsedHybrisProduct[] {
  const products: ParsedHybrisProduct[] = [];
  const rowPattern = /<li class="item[\s\S]*?(?=<li class="item|$)/gi;
  const rows = html.match(rowPattern) ?? [];

  for (const row of rows) {
    if (!/data-product-id="/i.test(row)) continue;

    const linkMatch =
      row.match(
        /<a[^>]*class="productMainLink"[^>]*href="(\/[^"]+\/p\/[^"]+)"[^>]*>/i
      ) ||
      row.match(
        /<a[^>]*href="(\/[^"]+\/p\/[^"]+)"[^>]*class="productMainLink"[^>]*>/i
      );
    if (!linkMatch) continue;

    const title =
      row.match(/data-prod-name="([^"]+)"/i)?.[1]?.trim() ||
      row.match(/<h2 class="title">([^<]+)</i)?.[1]?.trim();
    if (!title) continue;

    const brand = row.match(/data-product-brand="([^"]*)"/i)?.[1]?.trim() || null;
    const imageMatch = row.match(/<img[^>]+src="([^"]+)"[^>]*>/i);

    products.push({
      title,
      brand: brand || null,
      imageUrl: imageMatch?.[1]?.trim() || null,
      price: null,
      productUrl: resolveAbsoluteUrl(linkMatch[1], siteOrigin),
    });
  }

  return products;
}

export function parseHybrisSearchHtml(
  html: string,
  config: HybrisPlatformConfig
): ParsedHybrisProduct[] {
  if (config.variant === "lennox") {
    return parseLennoxHybrisHtml(html, config.siteOrigin);
  }
  return parseSiteoneHybrisHtml(html, config.siteOrigin);
}

export function mapHybrisProduct(args: {
  product: ParsedHybrisProduct;
  supplierId: string;
  source: SupplierProductSource;
}): SupplierProductResult {
  return {
    supplierId: args.supplierId,
    title: args.product.title,
    brand: args.product.brand,
    imageUrl: args.product.imageUrl,
    price: args.product.price,
    availability: "Found on supplier site",
    productUrl: args.product.productUrl,
    source: args.source,
    classification: "PRODUCT_PAGE",
  };
}
