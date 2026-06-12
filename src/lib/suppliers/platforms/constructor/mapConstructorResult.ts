import type { SupplierProductResult, SupplierProductSource } from "../../types";
import type { ConstructorPlatformConfig, ConstructorSearchResult } from "./types";

function extractBrand(data: ConstructorSearchResult["data"]): string | null {
  if (!data?.facets) return null;
  for (const facet of data.facets) {
    if (facet.name !== "prdBrand") continue;
    const value = facet.values?.[0];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function resolveImageUrl(
  data: NonNullable<ConstructorSearchResult["data"]>,
  imageCdnBase: string
): string | null {
  const raw = data.image_url ?? data.prdImageUrl ?? null;
  if (!raw || !raw.trim()) return null;
  const trimmed = raw.trim();
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }
  const base = imageCdnBase.replace(/\/$/, "");
  const path = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return `${base}${path}`;
}

function resolveProductUrl(
  data: NonNullable<ConstructorSearchResult["data"]>,
  siteOrigin: string
): string | null {
  const raw = data.url?.trim();
  if (!raw) return null;
  if (raw.startsWith("http://") || raw.startsWith("https://")) {
    return raw;
  }
  const origin = siteOrigin.replace(/\/$/, "");
  const path = raw.startsWith("/") ? raw : `/${raw}`;
  return `${origin}${path}`;
}

function resolveTitle(data: NonNullable<ConstructorSearchResult["data"]>): string {
  const prdName = data.prdName?.trim();
  if (prdName) return prdName;
  const value = data.value?.trim();
  if (value) return value;
  return "Product";
}

export function mapConstructorResult(args: {
  result: ConstructorSearchResult;
  supplierId: string;
  source: SupplierProductSource;
  config: ConstructorPlatformConfig;
}): SupplierProductResult | null {
  const data = args.result.data;
  if (!data) return null;

  const productUrl = resolveProductUrl(data, args.config.siteOrigin);
  if (!productUrl) return null;

  return {
    supplierId: args.supplierId,
    title: resolveTitle(data),
    brand: extractBrand(data),
    imageUrl: resolveImageUrl(data, args.config.imageCdnBase),
    price: null,
    availability: "Found on supplier site",
    productUrl,
    source: args.source,
    classification: "PRODUCT_PAGE",
  };
}
