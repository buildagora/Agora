import type { SupplierConstructorConfig } from "../../supplierSiteSearchConfig";
import { STOREFRONT_DEFAULT_NUM_RESULTS } from "@/lib/search/storefront/storefrontCatalogConstants";

export function resolveConstructorPlatformConfig(
  block: SupplierConstructorConfig,
  apiKey: string
) {
  return {
    apiKey,
    baseUrl: block.baseUrl ?? "https://ac.cnstrc.com",
    numResultsPerPage: block.numResultsPerPage ?? STOREFRONT_DEFAULT_NUM_RESULTS,
    imageCdnBase: block.imageCdnBase,
    siteOrigin: block.siteOrigin,
  };
}
