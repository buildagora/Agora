import { getDomainPlatformConfig } from "../supplierDomainPlatformConfig";
import type { SearchSupplierSiteParams } from "../searchSupplierSite";
import {
  SUPPLIER_SITE_SEARCH_CONFIG,
  buildSiteSearchParams,
  type SupplierSearchMode,
} from "../supplierSiteSearchConfig";
import type { SupplierAdapterPrefix } from "../supplierAdapterPrefixes";

const PLATFORM_MODES = new Set<SupplierSearchMode>([
  "constructor",
  "bloomreach",
  "sli",
  "coveo",
  "algolia",
  "shopify",
  "hybris",
]);

function resolveRegistryPrefix(
  supplierId: string
): SupplierAdapterPrefix | undefined {
  return Object.keys(SUPPLIER_SITE_SEARCH_CONFIG).find((prefix) =>
    supplierId.startsWith(prefix)
  ) as SupplierAdapterPrefix | undefined;
}

/**
 * Build Serp site-organic params matching legacy discovery's searchSupplierSite path.
 */
export function buildSerpSiteOrganicParams(
  supplierId: string,
  query: string,
  dbDomain: string | null | undefined
): SearchSupplierSiteParams | null {
  const prefix = resolveRegistryPrefix(supplierId);
  if (prefix) {
    const config = SUPPLIER_SITE_SEARCH_CONFIG[prefix];
    if (PLATFORM_MODES.has(config.mode)) {
      return null;
    }
    return buildSiteSearchParams(prefix, query, [supplierId]);
  }

  const domain = dbDomain?.trim();
  if (!domain) return null;
  if (getDomainPlatformConfig(domain)) return null;

  return {
    query,
    domain,
    supplierIds: [supplierId],
    source: "GENERIC",
    logLabel: "Supplier",
  };
}
