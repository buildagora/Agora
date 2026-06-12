import type { SupplierProductSource } from "./types";

export type SupplierBloomreachConfig = {
  accountId: string;
  domainKey: string;
  accountIdEnv?: string;
  domainKeyEnv?: string;
  /** e.g. search.bakerdist.com — defaults to core.dxpapi.com */
  hostname?: string;
  /** Path segment after hostname, default api/v1/core */
  apiPath?: string;
  baseImageUrl: string;
  siteOrigin: string;
  /** Optional env var for server-side auth_key */
  authKeyEnv?: string;
  numResults?: number;
};

export type SupplierSliConfig = {
  siteOrigin: string;
  /** Search results path, default /search */
  searchPath?: string;
  /** Query param for keyword, default searchPhrase */
  queryParam?: string;
  numResults?: number;
};

export type SupplierCoveoConfig = {
  organizationId: string;
  organizationIdEnv?: string;
  searchHub: string;
  searchHubEnv?: string;
  siteOrigin: string;
  apiKeyEnv: string;
  numResults?: number;
};

export type SupplierAlgoliaConfig = {
  appId: string;
  indexName: string;
  appIdEnv?: string;
  indexNameEnv?: string;
  siteOrigin: string;
  /** Public search-only key when exposed on storefront */
  searchApiKey?: string;
  apiKeyEnv?: string;
  numResults?: number;
};

export type SupplierShopifyConfig = {
  siteOrigin: string;
  /** Default /search/suggest.json */
  suggestPath?: string;
  numResults?: number;
};

export type SupplierHybrisConfig = {
  siteOrigin: string;
  searchPath?: string;
  queryParam?: string;
  /** PLP HTML layout variant */
  variant?: "siteone" | "lennox";
  numResults?: number;
};

export type DomainPlatformConfig = {
  mode: "bloomreach" | "sli" | "coveo" | "algolia" | "shopify" | "hybris";
  source: SupplierProductSource;
  logLabel: string;
  bloomreach?: SupplierBloomreachConfig;
  sli?: SupplierSliConfig;
  coveo?: SupplierCoveoConfig;
  algolia?: SupplierAlgoliaConfig;
  shopify?: SupplierShopifyConfig;
  hybris?: SupplierHybrisConfig;
};
