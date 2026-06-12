import type { SupplierShopifyConfig } from "../../supplierPlatformTypes";
import { STOREFRONT_DEFAULT_NUM_RESULTS } from "@/lib/search/storefront/storefrontCatalogConstants";

export type ShopifyPlatformConfig = {
  siteOrigin: string;
  suggestPath: string;
  numResults: number;
};

export type ShopifyProduct = {
  title?: string;
  vendor?: string;
  price?: string;
  image?: string;
  url?: string;
  handle?: string;
};

export type ShopifySuggestResponse = {
  resources?: {
    results?: {
      products?: ShopifyProduct[];
    };
  };
};

export type ShopifySearchParams = {
  query: string;
  supplierIds: string[];
  source: import("../../types").SupplierProductSource;
  logLabel: string;
  shopify: ShopifyPlatformConfig;
};

export function resolveShopifyPlatformConfig(
  block: SupplierShopifyConfig
): ShopifyPlatformConfig {
  return {
    siteOrigin: block.siteOrigin.replace(/\/$/, ""),
    suggestPath: block.suggestPath ?? "/search/suggest.json",
    numResults: block.numResults ?? STOREFRONT_DEFAULT_NUM_RESULTS,
  };
}
