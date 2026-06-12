import { getConstructorApiKey } from "@/lib/config/env";
import { getPrisma } from "@/lib/db.server";
import { findSupplierSearchAdapter } from "@/lib/suppliers/registry";
import { logAdapterBypassObservation } from "@/lib/suppliers/routing/extractionTelemetry";
import { shouldUseStorefrontOrchestrator } from "./shouldUseStorefrontOrchestrator";
import { STOREFRONT_DEFAULT_NUM_RESULTS } from "./storefrontCatalogConstants";
import { executePlatformCatalogSearch } from "@/lib/suppliers/executePlatformCatalogSearch";
import { searchConstructorCatalog } from "@/lib/suppliers/platforms/constructor/searchConstructorCatalog";
import {
  resolveConstructorPlatformConfig,
  searchSupplierDiscoveryForSupplier,
} from "@/lib/suppliers/resolveSupplierDiscovery";
import { searchSupplierSiteStructured } from "@/lib/suppliers/searchSupplierSite";
import type { SupplierSiteSearchStructured } from "@/lib/suppliers/searchSupplierSiteTypes";
import type { SupplierProductResult } from "@/lib/suppliers/types";
import { resolveStorefrontSiteSearchStrategy } from "./resolveStorefrontSiteSearchStrategy";

export { resolveStorefrontSiteSearchStrategy } from "./resolveStorefrontSiteSearchStrategy";
export type { StorefrontSiteSearchStrategy } from "./resolveStorefrontSiteSearchStrategy";

const EMPTY_SITE_SEARCH: SupplierSiteSearchStructured = {
  products: [],
  categories: [],
  brands: [],
  other: [],
  flat: [],
};

function structuredFromProductEngineAdapter(
  flat: SupplierProductResult[]
): SupplierSiteSearchStructured {
  return {
    products: flat,
    categories: [],
    brands: [],
    other: [],
    flat,
  };
}

/**
 * Live retrieval for storefront builder.
 *
 * - Home Depot / Lowe's: Serp product-engine adapters (flat SKU rows).
 * - Platform-native catalog adapters: Constructor, Bloomreach, SLI, Coveo, Algolia.
 * - Registered organic adapters: structured site search via registry config (not DB domain).
 * - Other suppliers: structured search when Supplier.domain is set in DB.
 */
export async function fetchSupplierSiteSearchForStorefront(
  supplierId: string,
  productSearchQuery: string,
  logLabel: string
): Promise<SupplierSiteSearchStructured> {
  const q = productSearchQuery.trim();
  if (!q) return { ...EMPTY_SITE_SEARCH };

  const prisma = getPrisma();
  const supplier = await prisma.supplier.findUnique({
    where: { id: supplierId },
    select: { domain: true, name: true },
  });

  if (shouldUseStorefrontOrchestrator(supplierId)) {
    const flat = (
      await searchSupplierDiscoveryForSupplier(
        supplierId,
        q,
        supplier?.domain,
        { entryPoint: "storefront" }
      )
    ).filter((row) => row.supplierId === supplierId);
    return structuredFromProductEngineAdapter(flat);
  }

  const strategy = resolveStorefrontSiteSearchStrategy(
    supplierId,
    supplier?.domain,
    logLabel || supplier?.name || "Supplier"
  );

  if (strategy.kind === "empty") {
    return { ...EMPTY_SITE_SEARCH };
  }

  if (strategy.kind === "product_engine") {
    const adapter = findSupplierSearchAdapter(supplierId);
    if (!adapter) return { ...EMPTY_SITE_SEARCH };
    logAdapterBypassObservation({
      supplierId,
      entryPoint: "storefront",
      query: q,
      strategyUsed: adapter.apiSource,
    });
    const flat = (await adapter.search(q)).filter((row) => row.supplierId === supplierId);
    return structuredFromProductEngineAdapter(flat);
  }

  if (strategy.kind === "constructor") {
    const apiKey = getConstructorApiKey(strategy.constructorConfig.apiKeyEnv);
    const flat = (
      await searchConstructorCatalog({
        query: q,
        supplierIds: [supplierId],
        source: strategy.source,
        logLabel: strategy.logLabel,
        constructor: resolveConstructorPlatformConfig(strategy.constructorConfig, apiKey),
      })
    ).filter((row) => row.supplierId === supplierId);
    return structuredFromProductEngineAdapter(flat);
  }

  if (strategy.kind === "platform_catalog") {
    const flat = (
      await executePlatformCatalogSearch({
        query: q,
        supplierIds: [supplierId],
        source: strategy.source,
        logLabel: strategy.logLabel,
        config: strategy.config,
      })
    ).filter((row) => row.supplierId === supplierId);
    return structuredFromProductEngineAdapter(flat);
  }

  if (strategy.kind === "site_organic") {
    return searchSupplierSiteStructured({
      query: q,
      domain: strategy.domain,
      supplierIds: [supplierId],
      source: strategy.source,
      logLabel: strategy.logLabel,
      extractImagesFromPage: strategy.extractImagesFromPage,
      minProductTarget: STOREFRONT_DEFAULT_NUM_RESULTS,
    });
  }

  return searchSupplierSiteStructured({
    query: q,
    domain: strategy.domain,
    supplierIds: [supplierId],
    source: "GENERIC",
    logLabel: strategy.logLabel,
    minProductTarget: STOREFRONT_DEFAULT_NUM_RESULTS,
  });
}
