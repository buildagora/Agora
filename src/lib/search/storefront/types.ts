import type { SupplierSearchMode } from "@/lib/search/getSearchMode";
import type { SupplierProductResult } from "@/lib/suppliers/types";
import type { StorefrontCatalogPagination } from "./storefrontCatalogTypes";

/**
 * UI layout for supplier detail storefront (Sprint 1+).
 * BROAD and REFINED both map to EXPLORATION; EXACT maps to PRODUCT_FIRST.
 */
export type StorefrontLayoutMode = "EXPLORATION" | "PRODUCT_FIRST";

/**
 * Where storefront section data originated. PR 1 skeleton always uses NONE.
 */
export type StorefrontDataProvenance =
  | "NONE"
  | "CAPABILITY"
  | "ONTOLOGY"
  | "SERP"
  | "MIXED";

export type StorefrontNavKind = "brand" | "category" | "other";

/**
 * Brand or category card for exploration layout. Sprint 1: external links only;
 * no in-app filter state.
 */
export type StorefrontNavItem = {
  id: string;
  label: string;
  kind: StorefrontNavKind;
  href: string | null;
  imageUrl?: string | null;
  source: StorefrontDataProvenance;
  count?: number;
};

/**
 * Readiness tier from Phase 10.2 fingerprint cohort (READY / PARTIAL / CAPABILITY).
 */
export type StorefrontTier = "READY" | "PARTIAL" | "CAPABILITY";

export type StorefrontArchetype =
  | "BIG_BOX"
  | "PLATFORM"
  | "DISTRIBUTOR"
  | "BRAND_DRIVEN"
  | "FLOORING"
  | "CAPABILITY";

export type StorefrontSidebarSection = "brands" | "categories" | "attributes";

export type StorefrontArchetypePresentation = {
  archetype: StorefrontArchetype;
  sidebarOrder: StorefrontSidebarSection[];
  brandProminence: "high" | "medium" | "low";
  categoryProminence: "high" | "medium" | "low";
  heroStyle: "catalog" | "brand" | "category" | "capability";
  gridColumns: 2 | 3 | 4;
};

/**
 * Buyer-facing discovery status badge on supplier header.
 */
export type StorefrontDiscoveryStatus =
  | "CATALOG_AVAILABLE"
  | "LIMITED_CATALOG"
  | "CAPABILITY_PROFILE";

export type StorefrontCatalogMetrics = {
  productCount: number;
  brandCount: number;
  categoryCount: number;
};

/**
 * Facet group for sidebar navigation (counts from catalog when available).
 */
export type StorefrontFacetGroup = {
  id: string;
  label: string;
  values: { id: string; label: string; count?: number }[];
  source: StorefrontDataProvenance;
};

export type StorefrontCategoryTreeNode = {
  id: string;
  label: string;
  href: string | null;
  count?: number;
  children: {
    id: string;
    label: string;
    href: string | null;
    count?: number;
  }[];
};

export type StorefrontExtractedAttribute = {
  key: string;
  label: string;
  value: string;
};

export type StorefrontSupplierSummary = {
  id: string;
  name: string;
  logoUrl: string | null;
  city: string | null;
  state: string | null;
  websiteUrl: string | null;
};

/**
 * Header copy for supplier detail. Intentionally omits catalog-scale counts.
 */
export type StorefrontHeader = {
  /** Primary title, e.g. query or category label */
  title: string;
  /** Subtitle, e.g. "Results from {supplier}" */
  subtitle: string;
  categoryLabel: string;
  locationLabel: string | null;
};

/**
 * Honest empty-state hints when sections have no live products (wired in later PRs).
 */
export type StorefrontEmptyStateHints = {
  hasBrandsOrCategories: boolean;
  hasProducts: boolean;
  supplierWebsiteUrl: string | null;
  suggestViewOnSupplierSite: boolean;
  suggestSendRequest: boolean;
};

export type StorefrontSections = {
  brands: StorefrontNavItem[];
  categories: StorefrontNavItem[];
  categoryTree: StorefrontCategoryTreeNode[];
  navigationLinks: StorefrontNavItem[];
  facetGroups: StorefrontFacetGroup[];
  extractedAttributes: StorefrontExtractedAttribute[];
  /** Live inventory / catalog search rows only — never capability profile matches. */
  products: SupplierProductResult[];
  /** Inferred capability profile rows from router terminal fallback. */
  capabilityProfiles: SupplierProductResult[];
};

/**
 * Full view model for supplier detail storefront. PR 1: sections are empty;
 * builder is sync and does not call Serp or Prisma.
 */
export type SupplierStorefrontView = {
  layoutMode: StorefrontLayoutMode;
  searchMode: SupplierSearchMode;
  /** Mirrors SUPPLIER_STOREFRONT_ENABLED; UI wiring deferred to later PRs. */
  featureEnabled: boolean;
  tier: StorefrontTier;
  discoveryStatus: StorefrontDiscoveryStatus;
  catalogMetrics: StorefrontCatalogMetrics;
  catalogPagination: StorefrontCatalogPagination;
  presentation: StorefrontArchetypePresentation;
  query: string;
  productSearchQuery: string;
  categoryId: string;
  header: StorefrontHeader;
  supplier: StorefrontSupplierSummary;
  sections: StorefrontSections;
  provenance: StorefrontDataProvenance;
  emptyState: StorefrontEmptyStateHints;
};

export type BuildSupplierStorefrontViewInput = {
  query: string;
  productSearchQuery: string;
  categoryId: string;
  categoryLabel: string;
  supplier: StorefrontSupplierSummary;
  searchMode: SupplierSearchMode;
  /** When set, forces PRODUCT_FIRST layout (existing listingTitle drill-down). */
  listingTitle?: string | null;
  locationLabel?: string | null;
  /** Structured URL filter — reflected in header title. */
  brandFilter?: string | null;
  categoryFilter?: string | null;
};
