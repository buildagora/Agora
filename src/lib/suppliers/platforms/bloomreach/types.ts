import type { SupplierBloomreachConfig } from "../../supplierPlatformTypes";
import type { SupplierCatalogPageOptions } from "../../supplierCatalogPageOptions";
import { STOREFRONT_DEFAULT_NUM_RESULTS } from "@/lib/search/storefront/storefrontCatalogConstants";
import { resolveConfigValue, getOptionalEnv } from "../platformEnv";

export type BloomreachPlatformConfig = {
  accountId: string;
  domainKey: string;
  authKey: string;
  hostname: string;
  apiPath: string;
  baseImageUrl: string;
  siteOrigin: string;
  numResults: number;
};

export type BloomreachDoc = {
  pid?: string;
  title?: string;
  brand?: string;
  url?: string;
  thumb_image?: string;
  sale_price?: string;
  price?: string;
};

export type BloomreachSearchResponse = {
  response?: {
    docs?: BloomreachDoc[];
    numFound?: number;
  };
};

export type BloomreachSearchParams = {
  query: string;
  supplierIds: string[];
  source: import("../../types").SupplierProductSource;
  logLabel: string;
  bloomreach: BloomreachPlatformConfig;
} & SupplierCatalogPageOptions;

export function resolveBloomreachPlatformConfig(
  block: SupplierBloomreachConfig
): BloomreachPlatformConfig | null {
  const accountId = resolveConfigValue(block.accountId, block.accountIdEnv);
  const domainKey = resolveConfigValue(block.domainKey, block.domainKeyEnv);
  if (!accountId || !domainKey) return null;

  return {
    accountId,
    domainKey,
    authKey: getOptionalEnv(block.authKeyEnv) ?? "",
    hostname: block.hostname ?? "core.dxpapi.com",
    apiPath: block.apiPath ?? "api/v1/core",
    baseImageUrl: block.baseImageUrl,
    siteOrigin: block.siteOrigin,
    numResults: block.numResults ?? STOREFRONT_DEFAULT_NUM_RESULTS,
  };
}
