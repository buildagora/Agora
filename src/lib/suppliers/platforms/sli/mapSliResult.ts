import type { SupplierProductResult, SupplierProductSource } from "../../types";
import type { SliPlatformConfig } from "./types";

type ParsedSliProduct = {
  title: string;
  brand: string | null;
  imageUrl: string | null;
  productUrl: string;
};

function resolveAbsoluteUrl(raw: string, siteOrigin: string): string {
  if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;
  const origin = siteOrigin.replace(/\/$/, "");
  const normalized = raw.replace(/^\.\//, "");
  const path = normalized.startsWith("/") ? normalized : `/${normalized}`;
  return `${origin}${path}`;
}

/** Parse SLI Learning Search HTML result rows (`.sli-product-row`). */
export function parseSliSearchHtml(html: string, siteOrigin: string): ParsedSliProduct[] {
  const products: ParsedSliProduct[] = [];
  const rowPattern =
    /class="row sli-product-row"[\s\S]*?(?=class="row sli-product-row"|$)/gi;
  const rows = html.match(rowPattern) ?? [];

  for (const row of rows) {
    const urlMatch = row.match(/href="(\.\/product-view\?pID=[^"]+|\/product-view\?pID=[^"]+)"/i);
    const titleMatch = row.match(/class="srp-displayname"[^>]*>([^<]+)</i);
    if (!urlMatch || !titleMatch) continue;

    const brandMatch = row.match(/class="srp-brand"[^>]*>([^<]+)</i);
    const imgTagMatch = row.match(/<img\b[^>]*\bsrp-productimg\b[^>]*>/i);
    const imageMatch = imgTagMatch?.[0].match(/\bsrc="([^"]+)"/i);

    products.push({
      title: titleMatch[1].trim(),
      brand: brandMatch?.[1]?.trim() ?? null,
      imageUrl: imageMatch?.[1]?.trim()
        ? resolveAbsoluteUrl(imageMatch[1].trim(), siteOrigin)
        : null,
      productUrl: resolveAbsoluteUrl(urlMatch[1].trim(), siteOrigin),
    });
  }

  return products;
}

export function mapSliProduct(args: {
  product: ParsedSliProduct;
  supplierId: string;
  source: SupplierProductSource;
}): SupplierProductResult {
  return {
    supplierId: args.supplierId,
    title: args.product.title,
    brand: args.product.brand,
    imageUrl: args.product.imageUrl,
    price: null,
    availability: "Found on supplier site",
    productUrl: args.product.productUrl,
    source: args.source,
    classification: "PRODUCT_PAGE",
  };
}
