import type { SupplierAdapterPrefix } from "./supplierAdapterPrefixes";
import { executePlatformCatalogSearch } from "./executePlatformCatalogSearch";
import { supplierSearchRegistry } from "./registry";
import type { SupplierExtractionEntryPoint } from "./routing/extractionTelemetry";
import { runSupplierDiscoveryRouting } from "./routing/resolveSupplierExtraction.server";
import { searchSupplierSite } from "./searchSupplierSite";
import {
  SUPPLIER_SITE_SEARCH_CONFIG,
  buildSiteSearchParams,
} from "./supplierSiteSearchConfig";
import type { SupplierProductResult } from "./types";
import { getDomainPlatformConfig } from "./supplierDomainPlatformConfig";

export { resolveConstructorPlatformConfig } from "./platforms/constructor/resolveConfig";

const PLATFORM_MODES = new Set([
  "constructor",
  "bloomreach",
  "sli",
  "coveo",
  "algolia",
  "shopify",
  "hybris",
]);

function hasProductEngineImage(row: SupplierProductResult): boolean {
  return typeof row.imageUrl === "string" && row.imageUrl.trim().length > 0;
}

/** Serp product-engine adapters (Home Depot / Lowe's) — not organic site search. */
async function searchProductEngineForPrefix(
  prefix: SupplierAdapterPrefix,
  query: string,
  supplierIds: string[]
): Promise<SupplierProductResult[]> {
  const searchFn = supplierSearchRegistry[prefix];
  if (!searchFn) return [];

  const allowed = new Set(supplierIds);
  const raw = await searchFn(query);
  return raw.filter(
    (row) => allowed.has(row.supplierId) && hasProductEngineImage(row)
  );
}

/**
 * Registry prefix discovery — routes by `mode` in supplierSiteSearchConfig.
 */
export async function searchSupplierDiscoveryForPrefix(
  prefix: SupplierAdapterPrefix,
  query: string,
  supplierIds: string[]
): Promise<SupplierProductResult[]> {
  const config = SUPPLIER_SITE_SEARCH_CONFIG[prefix];

  if (PLATFORM_MODES.has(config.mode)) {
    return executePlatformCatalogSearch({
      query,
      supplierIds,
      source: config.source,
      logLabel: config.logLabel,
      config,
    });
  }

  if (config.mode === "product_engine") {
    return searchProductEngineForPrefix(prefix, query, supplierIds);
  }

  return searchSupplierSite(buildSiteSearchParams(prefix, query, supplierIds));
}

/** Domain-based platform discovery for suppliers without a registry prefix. */
export async function searchSupplierDiscoveryForDomain(
  domain: string,
  query: string,
  supplierIds: string[]
): Promise<SupplierProductResult[]> {
  const config = getDomainPlatformConfig(domain);
  if (!config) return [];

  return executePlatformCatalogSearch({
    query,
    supplierIds,
    source: config.source,
    logLabel: config.logLabel,
    config,
  });
}

/** Frozen legacy discovery path — used as fallback and when router flags are off. */
export async function legacySupplierDiscoveryForSupplier(
  supplierId: string,
  query: string,
  dbDomain: string | null | undefined
): Promise<SupplierProductResult[]> {
  const prefix = Object.keys(SUPPLIER_SITE_SEARCH_CONFIG).find((p) =>
    supplierId.startsWith(p)
  ) as SupplierAdapterPrefix | undefined;

  if (prefix) {
    return searchSupplierDiscoveryForPrefix(prefix, query, [supplierId]);
  }

  const domain = dbDomain?.trim();
  if (!domain) return [];

  if (getDomainPlatformConfig(domain)) {
    return searchSupplierDiscoveryForDomain(domain, query, [supplierId]);
  }

  return searchSupplierSite({
    query,
    domain,
    supplierIds: [supplierId],
    source: "GENERIC",
    logLabel: "Supplier",
  });
}

export type SearchSupplierDiscoveryOptions = {
  /** Phase 8A — telemetry only. */
  entryPoint?: SupplierExtractionEntryPoint;
};

export async function searchSupplierDiscoveryForSupplier(
  supplierId: string,
  query: string,
  dbDomain: string | null | undefined,
  options?: SearchSupplierDiscoveryOptions
): Promise<SupplierProductResult[]> {
  return runSupplierDiscoveryRouting(
    {
      supplierId,
      query,
      dbDomain,
      entryPoint: options?.entryPoint,
    },
    () => legacySupplierDiscoveryForSupplier(supplierId, query, dbDomain)
  );
}
