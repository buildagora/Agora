import type { SupplierProductResult, SupplierProductSource } from "../../types";
import type { CoveoPlatformConfig, CoveoResult } from "./types";

function resolveProductUrl(result: CoveoResult, siteOrigin: string): string | null {
  const raw = result.raw;
  const candidate = raw?.clickableuri?.trim() || raw?.uri?.trim();
  if (!candidate) return null;
  if (candidate.startsWith("http://") || candidate.startsWith("https://")) return candidate;
  const origin = siteOrigin.replace(/\/$/, "");
  return `${origin}${candidate.startsWith("/") ? candidate : `/${candidate}`}`;
}

function resolveImageUrl(result: CoveoResult): string | null {
  const raw = result.raw;
  if (raw?.thumbimage?.trim()) return raw.thumbimage.trim();
  const fromEc = raw?.ec_images?.[0]?.trim();
  return fromEc || null;
}

export function mapCoveoResult(args: {
  result: CoveoResult;
  supplierId: string;
  source: SupplierProductSource;
  config: CoveoPlatformConfig;
}): SupplierProductResult | null {
  const title = args.result.title?.trim() || args.result.raw?.title?.trim();
  if (!title) return null;

  const productUrl = resolveProductUrl(args.result, args.config.siteOrigin);
  if (!productUrl) return null;

  return {
    supplierId: args.supplierId,
    title,
    brand: args.result.raw?.brand?.trim() || null,
    imageUrl: resolveImageUrl(args.result),
    price: null,
    availability: "Found on supplier site",
    productUrl,
    source: args.source,
    classification: "PRODUCT_PAGE",
  };
}
