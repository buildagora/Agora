import { findSupplierSearchAdapter } from "../registry";
import { getDomainPlatformConfig } from "../supplierDomainPlatformConfig";
import { getSupplierSiteSearchConfig } from "../supplierSiteSearchConfig";
import type { SupplierProductSource } from "../types";

/**
 * Resolve API/source label for a supplier — extracted from supplier-product-search route.
 * Falls back to GENERIC when no registry or domain config matches.
 */
export function resolveSupplierProductSource(
  supplierId: string,
  dbDomain?: string | null
): SupplierProductSource {
  const adapter = findSupplierSearchAdapter(supplierId);
  if (adapter) return adapter.apiSource;

  const registryConfig = getSupplierSiteSearchConfig(supplierId);
  if (registryConfig) return registryConfig.source;

  const domainConfig = getDomainPlatformConfig(dbDomain);
  if (domainConfig) return domainConfig.source;

  return "GENERIC";
}
