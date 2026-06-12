import { getConstructorApiKey } from "@/lib/config/env";
import { getPrisma } from "@/lib/db.server";
import { executePlatformCatalogSearchPaged } from "@/lib/suppliers/executePlatformCatalogSearch";
import { searchHomeDepotPaged } from "@/lib/suppliers/homeDepot";
import { searchLowesPaged } from "@/lib/suppliers/lowes";
import { findSupplierSearchAdapter } from "@/lib/suppliers/registry";
import { logAdapterBypassObservation } from "@/lib/suppliers/routing/extractionTelemetry";
import { searchSupplierDiscoveryForSupplier } from "@/lib/suppliers/resolveSupplierDiscovery";
import { searchSupplierSiteStructured } from "@/lib/suppliers/searchSupplierSite";
import { searchConstructorCatalogPaged } from "@/lib/suppliers/platforms/constructor/searchConstructorCatalog";
import { resolveConstructorPlatformConfig } from "@/lib/suppliers/platforms/constructor/resolveConfig";
import type { SupplierProductResult } from "@/lib/suppliers/types";
import { isStorefrontProduct } from "./mapStorefrontBuildData";
import { resolveStorefrontSiteSearchStrategy } from "./resolveStorefrontSiteSearchStrategy";
import { shouldUseStorefrontOrchestrator } from "./shouldUseStorefrontOrchestrator";
import {
  clampStorefrontPage,
  clampStorefrontPageSize,
  STOREFRONT_DEFAULT_NUM_RESULTS,
  STOREFRONT_INITIAL_PAGE_SIZE,
} from "./storefrontCatalogConstants";
import type {
  StorefrontCatalogPageRequest,
  StorefrontCatalogPageResult,
} from "./storefrontCatalogTypes";

function paginateInMemory(
  products: SupplierProductResult[],
  page: number,
  pageSize: number
): StorefrontCatalogPageResult {
  const start = (page - 1) * pageSize;
  const slice = products.slice(start, start + pageSize);
  return {
    products: slice,
    pagination: {
      page,
      pageSize,
      totalCount: products.length,
      hasMore: start + pageSize < products.length,
    },
  };
}

async function fetchStorefrontProductEnginePage(
  supplierId: string,
  query: string,
  page: number,
  pageSize: number
): Promise<StorefrontCatalogPageResult | null> {
  const adapter = findSupplierSearchAdapter(supplierId);
  if (!adapter) return null;

  logAdapterBypassObservation({
    supplierId,
    entryPoint: "storefront",
    query,
    strategyUsed: adapter.apiSource,
  });

  if (adapter.apiSource === "HOME_DEPOT") {
    const paged = await searchHomeDepotPaged(query, { page, pageSize });
    const scoped = paged.products.filter((r) => r.supplierId === supplierId);
    return {
      products: scoped,
      pagination: {
        page,
        pageSize,
        totalCount: paged.totalCount,
        hasMore: paged.hasMore,
      },
    };
  }

  if (adapter.apiSource === "LOWES") {
    const paged = await searchLowesPaged(query, { page, pageSize });
    const scoped = paged.products.filter((r) => r.supplierId === supplierId);
    return {
      products: scoped,
      pagination: {
        page,
        pageSize,
        totalCount: paged.totalCount,
        hasMore: paged.hasMore,
      },
    };
  }

  const flat = (await adapter.search(query)).filter((r) => r.supplierId === supplierId);
  return paginateInMemory(flat, page, pageSize);
}

/**
 * Paginated catalog retrieval for storefront SSR and `/api/storefront/catalog`.
 */
export async function fetchStorefrontCatalogPage(
  input: StorefrontCatalogPageRequest
): Promise<StorefrontCatalogPageResult> {
  const q = input.productSearchQuery.trim();
  const page = clampStorefrontPage(input.page ?? 1);
  const pageSize = clampStorefrontPageSize(
    input.pageSize ?? STOREFRONT_INITIAL_PAGE_SIZE
  );

  if (!q) {
    return {
      products: [],
      pagination: { page, pageSize, totalCount: 0, hasMore: false },
    };
  }

  const supplierId = input.supplierId;
  const prisma = getPrisma();
  const supplier = await prisma.supplier.findUnique({
    where: { id: supplierId },
    select: { domain: true, name: true },
  });

  const strategy = resolveStorefrontSiteSearchStrategy(
    supplierId,
    supplier?.domain,
    input.logLabel || supplier?.name || "Supplier"
  );

  // Product-engine suppliers always use dedicated Serp adapters (pagination + depth).
  if (strategy.kind === "product_engine") {
    const paged = await fetchStorefrontProductEnginePage(
      supplierId,
      q,
      page,
      pageSize
    );
    return (
      paged ?? {
        products: [],
        pagination: { page, pageSize, totalCount: 0, hasMore: false },
      }
    );
  }

  if (shouldUseStorefrontOrchestrator(supplierId)) {
    const flat = (
      await searchSupplierDiscoveryForSupplier(
        supplierId,
        q,
        supplier?.domain,
        { entryPoint: "storefront" }
      )
    ).filter(
      (row) => row.supplierId === supplierId && isStorefrontProduct(row)
    );
    return paginateInMemory(flat, page, pageSize);
  }

  if (strategy.kind === "empty") {
    return {
      products: [],
      pagination: { page, pageSize, totalCount: 0, hasMore: false },
    };
  }

  if (strategy.kind === "constructor") {
    const apiKey = getConstructorApiKey(strategy.constructorConfig.apiKeyEnv);
    const paged = await searchConstructorCatalogPaged({
      query: q,
      supplierIds: [supplierId],
      source: strategy.source,
      logLabel: strategy.logLabel,
      constructor: resolveConstructorPlatformConfig(
        strategy.constructorConfig,
        apiKey
      ),
      page,
      pageSize,
    });
    return {
      products: paged.products.filter((r) => r.supplierId === supplierId),
      pagination: {
        page,
        pageSize,
        totalCount: paged.totalCount,
        hasMore: paged.hasMore,
      },
    };
  }

  if (strategy.kind === "platform_catalog") {
    const paged = await executePlatformCatalogSearchPaged({
      query: q,
      supplierIds: [supplierId],
      source: strategy.source,
      logLabel: strategy.logLabel,
      config: strategy.config,
      page,
      pageSize,
    });
    return {
      products: paged.products.filter((r) => r.supplierId === supplierId),
      pagination: {
        page,
        pageSize,
        totalCount: paged.totalCount,
        hasMore: paged.hasMore,
      },
    };
  }

  if (strategy.kind === "site_organic") {
    const structured = await searchSupplierSiteStructured({
      query: q,
      domain: strategy.domain,
      supplierIds: [supplierId],
      source: strategy.source,
      logLabel: strategy.logLabel,
      extractImagesFromPage: strategy.extractImagesFromPage,
      minProductTarget: STOREFRONT_DEFAULT_NUM_RESULTS,
    });
    const products = structured.products.filter(
      (row) => row.supplierId === supplierId && isStorefrontProduct(row)
    );
    return paginateInMemory(products, page, pageSize);
  }

  if (strategy.kind === "generic_db") {
    const structured = await searchSupplierSiteStructured({
      query: q,
      domain: strategy.domain,
      supplierIds: [supplierId],
      source: "GENERIC",
      logLabel: strategy.logLabel,
      minProductTarget: STOREFRONT_DEFAULT_NUM_RESULTS,
    });
    const products = structured.products.filter(
      (row) => row.supplierId === supplierId && isStorefrontProduct(row)
    );
    return paginateInMemory(products, page, pageSize);
  }

  return {
    products: [],
    pagination: { page, pageSize, totalCount: 0, hasMore: false },
  };
}
