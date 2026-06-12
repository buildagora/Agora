import type { SupplierCoveoConfig } from "../../supplierPlatformTypes";
import { STOREFRONT_DEFAULT_NUM_RESULTS } from "@/lib/search/storefront/storefrontCatalogConstants";
import { getOptionalEnv, resolveConfigValue } from "../platformEnv";

export type CoveoPlatformConfig = {
  organizationId: string;
  searchHub: string;
  apiKey: string;
  siteOrigin: string;
  numResults: number;
};

export type CoveoResult = {
  title?: string;
  raw?: {
    title?: string;
    brand?: string;
    uri?: string;
    clickableuri?: string;
    thumbimage?: string;
    ec_images?: string[];
  };
};

export type CoveoSearchResponse = {
  results?: CoveoResult[];
  totalCount?: number;
};

export type CoveoSearchParams = {
  query: string;
  supplierIds: string[];
  source: import("../../types").SupplierProductSource;
  logLabel: string;
  coveo: CoveoPlatformConfig;
} & import("../../supplierCatalogPageOptions").SupplierCatalogPageOptions;

export function resolveCoveoPlatformConfig(block: SupplierCoveoConfig): CoveoPlatformConfig | null {
  const organizationId = resolveConfigValue(block.organizationId, block.organizationIdEnv);
  const searchHub = resolveConfigValue(block.searchHub, block.searchHubEnv) ?? "default";
  if (!organizationId) return null;

  const apiKey = getOptionalEnv(block.apiKeyEnv) ?? "";
  if (!apiKey) return null;

  return {
    organizationId,
    searchHub,
    apiKey,
    siteOrigin: block.siteOrigin,
    numResults: block.numResults ?? STOREFRONT_DEFAULT_NUM_RESULTS,
  };
}
