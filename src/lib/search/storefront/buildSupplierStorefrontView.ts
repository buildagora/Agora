import { isCapabilityProfileResult } from "@/lib/suppliers/capability/profileResultContract";
import { buildStorefrontCatalogMetrics } from "./buildStorefrontCatalogMetrics";
import {
  buildStorefrontCategoryTree,
  enrichNavItemsWithCounts,
} from "./buildStorefrontCategoryTree";
import { buildStorefrontFacets } from "./buildStorefrontFacets";
import { parseQueryAttributes } from "./parseQueryAttributes";
import { getStorefrontLayoutMode } from "./getStorefrontLayoutMode";
import { isSupplierStorefrontEnabled } from "./isSupplierStorefrontEnabled";
import {
  mapStorefrontSections,
  resolveStorefrontProvenance,
} from "./mapStorefrontBuildData";
import { resolveStorefrontArchetype } from "./resolveStorefrontArchetype";
import {
  lookupStorefrontTier,
  resolveStorefrontDiscoveryStatus,
} from "./resolveStorefrontTier";
import { EMPTY_CATALOG_PAGINATION } from "./storefrontCatalogTypes";
import type { StorefrontBuildData } from "./storefrontBuildData";
import type {
  BuildSupplierStorefrontViewInput,
  StorefrontEmptyStateHints,
  StorefrontHeader,
  SupplierStorefrontView,
} from "./types";

function buildHeader(input: BuildSupplierStorefrontViewInput): StorefrontHeader {
  const filterParts = [input.brandFilter, input.categoryFilter].filter(
    (p): p is string => typeof p === "string" && p.trim().length > 0
  );
  const title =
    filterParts.length > 0
      ? filterParts.join(" · ")
      : input.query.trim() || input.categoryLabel;
  return {
    title,
    subtitle: `Results from ${input.supplier.name}`,
    categoryLabel: input.categoryLabel,
    locationLabel: input.locationLabel ?? null,
  };
}

function buildEmptyState(
  input: BuildSupplierStorefrontViewInput,
  sections: SupplierStorefrontView["sections"]
): StorefrontEmptyStateHints {
  const hasBrandsOrCategories =
    sections.brands.length > 0 ||
    sections.categories.length > 0 ||
    sections.navigationLinks.length > 0;
  const hasProducts = sections.products.length > 0;
  const hasCapabilityProfiles = sections.capabilityProfiles.length > 0;
  const supplierWebsiteUrl = input.supplier.websiteUrl?.trim() || null;

  return {
    hasBrandsOrCategories,
    hasProducts,
    supplierWebsiteUrl,
    suggestViewOnSupplierSite: false,
    suggestSendRequest: !hasProducts && !hasCapabilityProfiles,
  };
}

/**
 * Pure assembly: combines pre-fetched capability + Serp data into a view model.
 */
export function assembleSupplierStorefrontView(
  input: BuildSupplierStorefrontViewInput,
  data: StorefrontBuildData
): SupplierStorefrontView {
  const layoutMode = getStorefrontLayoutMode(input.searchMode, {
    listingTitle: input.listingTitle,
  });

  const sections = mapStorefrontSections(
    input.supplier.id,
    data.capabilityAggregate,
    data.siteSearch
  );
  sections.capabilityProfiles = (data.capabilityProfiles ?? []).filter(
    (row) =>
      row.supplierId === input.supplier.id && isCapabilityProfileResult(row)
  );
  sections.products = sections.products.filter(
    (row) => !isCapabilityProfileResult(row)
  );

  if (data.catalogPage) {
    sections.products = data.catalogPage.products.filter(
      (row) => !isCapabilityProfileResult(row)
    );
  }

  sections.brands = enrichNavItemsWithCounts(
    sections.brands,
    sections.products,
    "brand"
  );
  sections.categories = enrichNavItemsWithCounts(
    sections.categories,
    sections.products,
    "category"
  );
  sections.categoryTree = buildStorefrontCategoryTree(
    data.capabilityAggregate,
    sections.products
  );
  sections.extractedAttributes = parseQueryAttributes(input.query);

  const provenance = resolveStorefrontProvenance(
    data.capabilityAggregate,
    data.siteSearch,
    sections
  );

  sections.facetGroups = buildStorefrontFacets({
    query: input.query,
    categoryId: input.categoryId,
    products: sections.products,
    provenance,
  });

  const tier = lookupStorefrontTier(input.supplier.id);
  const presentation = resolveStorefrontArchetype(input.supplier.id, tier);
  const catalogMetrics = buildStorefrontCatalogMetrics(sections);
  const catalogPagination = data.catalogPage?.pagination ?? {
    ...EMPTY_CATALOG_PAGINATION,
    totalCount: sections.products.length,
    hasMore: false,
  };
  const discoveryStatus = resolveStorefrontDiscoveryStatus(
    tier,
    catalogMetrics.productCount
  );

  const header = buildHeader(input);

  return {
    layoutMode,
    searchMode: input.searchMode,
    featureEnabled: isSupplierStorefrontEnabled(),
    tier,
    discoveryStatus,
    catalogMetrics,
    catalogPagination,
    presentation,
    query: input.query,
    productSearchQuery: input.productSearchQuery,
    categoryId: input.categoryId,
    header,
    supplier: input.supplier,
    sections,
    provenance,
    emptyState: buildEmptyState(input, sections),
  };
}
