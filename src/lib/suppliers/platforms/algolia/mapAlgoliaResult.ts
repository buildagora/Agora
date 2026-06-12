import type { SupplierProductResult, SupplierProductSource } from "../../types";
import type { AlgoliaHit, AlgoliaPlatformConfig } from "./types";

function resolveImageUrl(hit: AlgoliaHit): string | null {
  if (hit.image_url?.trim()) return hit.image_url.trim();
  if (hit.image?.trim()) return hit.image.trim();
  const fromImages = hit.images?.[0]?.url?.trim();
  if (!fromImages) return null;
  if (fromImages.startsWith("//")) return `https:${fromImages}`;
  return fromImages;
}

function resolveProductUrl(hit: AlgoliaHit, siteOrigin: string): string | null {
  const raw = hit.url?.trim();
  if (raw) {
    if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;
    const origin = siteOrigin.replace(/\/$/, "");
    return `${origin}${raw.startsWith("/") ? raw : `/${raw}`}`;
  }
  const id = hit.id?.trim() || hit.objectID?.trim();
  if (id) {
    return `${siteOrigin.replace(/\/$/, "")}/product/${encodeURIComponent(id)}`;
  }
  return null;
}

function resolvePrice(hit: AlgoliaHit): string | null {
  const priceRaw = hit.price;
  if (typeof priceRaw === "number") return String(priceRaw);
  if (typeof priceRaw === "string") return priceRaw.trim() || null;
  if (priceRaw && typeof priceRaw === "object") {
    const usd = (priceRaw as { USD?: number | string }).USD;
    if (typeof usd === "number") return String(usd);
    if (typeof usd === "string") return usd.trim() || null;
  }

  const salePrice = hit.salePrice;
  if (typeof salePrice === "number") return String(salePrice);
  if (typeof salePrice === "string") return salePrice.trim() || null;

  return null;
}

export function mapAlgoliaResult(args: {
  hit: AlgoliaHit;
  supplierId: string;
  source: SupplierProductSource;
  config: AlgoliaPlatformConfig;
}): SupplierProductResult | null {
  const title = args.hit.name?.trim() || args.hit.title?.trim();
  if (!title) return null;

  const productUrl = resolveProductUrl(args.hit, args.config.siteOrigin);
  if (!productUrl) return null;

  return {
    supplierId: args.supplierId,
    title,
    brand: args.hit.brand?.trim() || null,
    imageUrl: resolveImageUrl(args.hit),
    price: resolvePrice(args.hit),
    availability: "Found on supplier site",
    productUrl,
    source: args.source,
    classification: "PRODUCT_PAGE",
  };
}
