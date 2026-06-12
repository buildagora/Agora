import type { SupplierProductResult, SupplierProductSource } from "../../types";
import type { ShopifyPlatformConfig, ShopifyProduct } from "./types";

function resolveProductUrl(product: ShopifyProduct, siteOrigin: string): string | null {
  const raw = product.url?.trim();
  if (raw) {
    if (raw.startsWith("http://") || raw.startsWith("https://")) return raw.split("?")[0];
    const path = raw.startsWith("/") ? raw.split("?")[0] : `/${raw.split("?")[0]}`;
    return `${siteOrigin}${path}`;
  }
  if (product.handle?.trim()) {
    return `${siteOrigin}/products/${encodeURIComponent(product.handle.trim())}`;
  }
  return null;
}

export function mapShopifyResult(args: {
  product: ShopifyProduct;
  supplierId: string;
  source: SupplierProductSource;
  config: ShopifyPlatformConfig;
}): SupplierProductResult | null {
  const title = args.product.title?.trim();
  if (!title) return null;

  const productUrl = resolveProductUrl(args.product, args.config.siteOrigin);
  if (!productUrl) return null;

  return {
    supplierId: args.supplierId,
    title,
    brand: args.product.vendor?.trim() || null,
    imageUrl: args.product.image?.trim() || null,
    price: args.product.price?.trim() || null,
    availability: "Found on supplier site",
    productUrl,
    source: args.source,
    classification: "PRODUCT_PAGE",
  };
}
