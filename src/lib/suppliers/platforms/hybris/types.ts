import type { SupplierHybrisConfig } from "../../supplierPlatformTypes";
import { STOREFRONT_DEFAULT_NUM_RESULTS } from "@/lib/search/storefront/storefrontCatalogConstants";

export type HybrisPlatformConfig = {
  siteOrigin: string;
  searchPath: string;
  queryParam: string;
  variant: "siteone" | "lennox";
  numResults: number;
};

export type ParsedHybrisProduct = {
  title: string;
  brand: string | null;
  imageUrl: string | null;
  price: string | null;
  productUrl: string;
};

export type HybrisSearchParams = {
  query: string;
  supplierIds: string[];
  source: import("../../types").SupplierProductSource;
  logLabel: string;
  hybris: HybrisPlatformConfig;
};

export function resolveHybrisPlatformConfig(block: SupplierHybrisConfig): HybrisPlatformConfig {
  return {
    siteOrigin: block.siteOrigin.replace(/\/$/, ""),
    searchPath: block.searchPath ?? "/search",
    queryParam: block.queryParam ?? "q",
    variant: block.variant ?? "siteone",
    numResults: block.numResults ?? STOREFRONT_DEFAULT_NUM_RESULTS,
  };
}
