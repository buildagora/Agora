import type { SupplierSliConfig } from "../../supplierPlatformTypes";
import { STOREFRONT_DEFAULT_NUM_RESULTS } from "@/lib/search/storefront/storefrontCatalogConstants";

export type SliPlatformConfig = {
  siteOrigin: string;
  searchPath: string;
  queryParam: string;
  numResults: number;
};

export type SliSearchParams = {
  query: string;
  supplierIds: string[];
  source: import("../../types").SupplierProductSource;
  logLabel: string;
  sli: SliPlatformConfig;
};

export function resolveSliPlatformConfig(block: SupplierSliConfig): SliPlatformConfig {
  return {
    siteOrigin: block.siteOrigin.replace(/\/$/, ""),
    searchPath: block.searchPath ?? "/search",
    queryParam: block.queryParam ?? "searchPhrase",
    numResults: block.numResults ?? STOREFRONT_DEFAULT_NUM_RESULTS,
  };
}
