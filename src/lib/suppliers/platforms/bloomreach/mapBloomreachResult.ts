import type { SupplierProductResult, SupplierProductSource } from "../../types";
import type { BloomreachDoc, BloomreachPlatformConfig } from "./types";

function resolveImageUrl(doc: BloomreachDoc, baseImageUrl: string): string | null {
  const raw = doc.thumb_image?.trim();
  if (!raw) return null;
  if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;
  const base = baseImageUrl.replace(/\/$/, "");
  const path = raw.startsWith("/") ? raw : `/${raw}`;
  return `${base}${path}`;
}

function resolveProductUrl(doc: BloomreachDoc, siteOrigin: string): string | null {
  const raw = doc.url?.trim();
  if (!raw) return null;
  if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;
  const origin = siteOrigin.replace(/\/$/, "");
  const path = raw.startsWith("/") ? raw : `/${raw}`;
  return `${origin}${path}`;
}

export function mapBloomreachResult(args: {
  doc: BloomreachDoc;
  supplierId: string;
  source: SupplierProductSource;
  config: BloomreachPlatformConfig;
}): SupplierProductResult | null {
  const title = args.doc.title?.trim();
  if (!title) return null;

  const productUrl = resolveProductUrl(args.doc, args.config.siteOrigin);
  if (!productUrl) return null;

  const price = args.doc.sale_price?.trim() || args.doc.price?.trim() || null;

  return {
    supplierId: args.supplierId,
    title,
    brand: args.doc.brand?.trim() || null,
    imageUrl: resolveImageUrl(args.doc, args.config.baseImageUrl),
    price,
    availability: "Found on supplier site",
    productUrl,
    source: args.source,
    classification: "PRODUCT_PAGE",
  };
}
