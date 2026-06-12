import type { DomainPlatformConfig } from "./supplierPlatformTypes";
import type { SupplierSiteSearchConfig } from "./supplierSiteSearchConfig";
import type { SupplierCatalogPageOptions, SupplierCatalogPageResult } from "./supplierCatalogPageOptions";
import type { SupplierProductResult, SupplierProductSource } from "./types";
import { searchAlgoliaCatalogPaged } from "./platforms/algolia/searchAlgoliaCatalog";
import { resolveAlgoliaPlatformConfig } from "./platforms/algolia/types";
import { searchBloomreachCatalogPaged } from "./platforms/bloomreach/searchBloomreachCatalog";
import { resolveBloomreachPlatformConfig } from "./platforms/bloomreach/types";
import { searchConstructorCatalogPaged } from "./platforms/constructor/searchConstructorCatalog";
import { resolveConstructorPlatformConfig } from "./platforms/constructor/resolveConfig";
import { searchCoveoCatalogPaged } from "./platforms/coveo/searchCoveoCatalog";
import { resolveCoveoPlatformConfig } from "./platforms/coveo/types";
import { searchHybrisCatalog } from "./platforms/hybris/searchHybrisCatalog";
import { resolveHybrisPlatformConfig } from "./platforms/hybris/types";
import { searchShopifyCatalog } from "./platforms/shopify/searchShopifyCatalog";
import { resolveShopifyPlatformConfig } from "./platforms/shopify/types";
import { searchSliCatalog } from "./platforms/sli/searchSliCatalog";
import { resolveSliPlatformConfig } from "./platforms/sli/types";
import { getConstructorApiKey } from "@/lib/config/env";
import {
  clampStorefrontPageSize,
  STOREFRONT_DEFAULT_NUM_RESULTS,
} from "@/lib/search/storefront/storefrontCatalogConstants";

type PlatformDiscoveryInput = {
  query: string;
  supplierIds: string[];
  source: SupplierProductSource;
  logLabel: string;
  config: SupplierSiteSearchConfig | DomainPlatformConfig;
} & SupplierCatalogPageOptions;

function paginateSlice(
  products: SupplierProductResult[],
  page: number,
  pageSize: number
): SupplierCatalogPageResult {
  const start = (page - 1) * pageSize;
  const slice = products.slice(start, start + pageSize);
  return {
    products: slice,
    totalCount: products.length,
    hasMore: start + pageSize < products.length,
  };
}

export async function executePlatformCatalogSearchPaged(
  input: PlatformDiscoveryInput
): Promise<SupplierCatalogPageResult> {
  const { config, query, supplierIds, source, logLabel } = input;
  const page = Math.max(1, input.page ?? 1);
  const pageSize = clampStorefrontPageSize(
    input.pageSize ?? STOREFRONT_DEFAULT_NUM_RESULTS
  );

  if (config.mode === "constructor" && "constructorPlatform" in config && config.constructorPlatform) {
    const apiKey = getConstructorApiKey(config.constructorPlatform.apiKeyEnv);
    return searchConstructorCatalogPaged({
      query,
      supplierIds,
      source,
      logLabel,
      constructor: resolveConstructorPlatformConfig(config.constructorPlatform, apiKey),
      page,
      pageSize,
    });
  }

  if (config.mode === "bloomreach" && config.bloomreach) {
    const bloomreach = resolveBloomreachPlatformConfig(config.bloomreach);
    if (!bloomreach) {
      console.warn(`Bloomreach config incomplete for ${logLabel}`);
      return { products: [], totalCount: null, hasMore: false };
    }
    return searchBloomreachCatalogPaged({
      query,
      supplierIds,
      source,
      logLabel,
      bloomreach,
      page,
      pageSize,
    });
  }

  if (config.mode === "coveo" && config.coveo) {
    const coveo = resolveCoveoPlatformConfig(config.coveo);
    if (!coveo) {
      console.warn(`Coveo config incomplete for ${logLabel}`);
      return { products: [], totalCount: null, hasMore: false };
    }
    return searchCoveoCatalogPaged({
      query,
      supplierIds,
      source,
      logLabel,
      coveo,
      page,
      pageSize,
    });
  }

  if (config.mode === "algolia" && config.algolia) {
    const algolia = resolveAlgoliaPlatformConfig(config.algolia);
    if (!algolia) {
      console.warn(`Algolia config incomplete for ${logLabel}`);
      return { products: [], totalCount: null, hasMore: false };
    }
    return searchAlgoliaCatalogPaged({
      query,
      supplierIds,
      source,
      logLabel,
      algolia,
      page,
      pageSize,
    });
  }

  const flat = await executePlatformCatalogSearch(input);
  return paginateSlice(flat, page, pageSize);
}

export async function executePlatformCatalogSearch(
  input: Omit<PlatformDiscoveryInput, "page" | "pageSize">
): Promise<SupplierProductResult[]> {
  const { config, query, supplierIds, source, logLabel } = input;

  if (config.mode === "constructor" && "constructorPlatform" in config && config.constructorPlatform) {
    const apiKey = getConstructorApiKey(config.constructorPlatform.apiKeyEnv);
    const paged = await searchConstructorCatalogPaged({
      query,
      supplierIds,
      source,
      logLabel,
      constructor: resolveConstructorPlatformConfig(config.constructorPlatform, apiKey),
    });
    return paged.products;
  }

  if (config.mode === "bloomreach" && config.bloomreach) {
    const bloomreach = resolveBloomreachPlatformConfig(config.bloomreach);
    if (!bloomreach) {
      console.warn(`Bloomreach config incomplete for ${logLabel}`);
      return [];
    }
    const paged = await searchBloomreachCatalogPaged({
      query,
      supplierIds,
      source,
      logLabel,
      bloomreach,
    });
    return paged.products;
  }

  if (config.mode === "sli" && config.sli) {
    return searchSliCatalog({
      query,
      supplierIds,
      source,
      logLabel,
      sli: resolveSliPlatformConfig(config.sli),
    });
  }

  if (config.mode === "coveo" && config.coveo) {
    const coveo = resolveCoveoPlatformConfig(config.coveo);
    if (!coveo) {
      console.warn(`Coveo config incomplete for ${logLabel}`);
      return [];
    }
    const paged = await searchCoveoCatalogPaged({
      query,
      supplierIds,
      source,
      logLabel,
      coveo,
    });
    return paged.products;
  }

  if (config.mode === "algolia" && config.algolia) {
    const algolia = resolveAlgoliaPlatformConfig(config.algolia);
    if (!algolia) {
      console.warn(`Algolia config incomplete for ${logLabel}`);
      return [];
    }
    const paged = await searchAlgoliaCatalogPaged({
      query,
      supplierIds,
      source,
      logLabel,
      algolia,
    });
    return paged.products;
  }

  if (config.mode === "shopify" && config.shopify) {
    return searchShopifyCatalog({
      query,
      supplierIds,
      source,
      logLabel,
      shopify: resolveShopifyPlatformConfig(config.shopify),
    });
  }

  if (config.mode === "hybris" && config.hybris) {
    return searchHybrisCatalog({
      query,
      supplierIds,
      source,
      logLabel,
      hybris: resolveHybrisPlatformConfig(config.hybris),
    });
  }

  return [];
}
