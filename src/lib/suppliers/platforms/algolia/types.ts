import type { SupplierAlgoliaConfig } from "../../supplierPlatformTypes";
import { STOREFRONT_DEFAULT_NUM_RESULTS } from "@/lib/search/storefront/storefrontCatalogConstants";
import { getOptionalEnv, resolveConfigValue } from "../platformEnv";

export type AlgoliaPlatformConfig = {
  appId: string;
  apiKey: string;
  indexName: string;
  siteOrigin: string;
  numResults: number;
};

export type AlgoliaHit = {
  id?: string;
  objectID?: string;
  name?: string;
  title?: string;
  brand?: string;
  url?: string;
  image?: string;
  image_url?: string;
  images?: Array<{ url?: string }>;
  price?: string | number | { USD?: number | string };
  salePrice?: string | number;
};

export type AlgoliaSearchResponse = {
  hits?: AlgoliaHit[];
  nbHits?: number;
  nbPages?: number;
  page?: number;
};

export type AlgoliaSearchParams = {
  query: string;
  supplierIds: string[];
  source: import("../../types").SupplierProductSource;
  logLabel: string;
  algolia: AlgoliaPlatformConfig;
  page?: number;
  pageSize?: number;
};

export function resolveAlgoliaPlatformConfig(
  block: SupplierAlgoliaConfig
): AlgoliaPlatformConfig | null {
  const appId = resolveConfigValue(block.appId, block.appIdEnv);
  const indexName = resolveConfigValue(block.indexName, block.indexNameEnv);
  const apiKey = block.searchApiKey?.trim() || getOptionalEnv(block.apiKeyEnv);
  if (!appId || !indexName || !apiKey) return null;

  return {
    appId,
    apiKey,
    indexName,
    siteOrigin: block.siteOrigin,
    numResults: block.numResults ?? STOREFRONT_DEFAULT_NUM_RESULTS,
  };
}
