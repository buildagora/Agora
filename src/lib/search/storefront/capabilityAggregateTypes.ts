/**
 * Capability-derived aggregates for storefront sections (PR 3).
 * No product/catalog counts — only distinct labels from SupplierCapability rows.
 */

export type StorefrontCapabilityBrand = {
  id: string;
  label: string;
  /** Marketplace category ids where this brand appears for the supplier. */
  categoryIds: string[];
  href: string | null;
};

export type StorefrontCapabilityCategory = {
  id: string;
  categoryId: string;
  label: string;
  href: string | null;
};

export type StorefrontCapabilitySubcategory = {
  id: string;
  label: string;
  categoryId: string;
  href: string | null;
};

export type SupplierCapabilityAggregate = {
  supplierId: string;
  brands: StorefrontCapabilityBrand[];
  categories: StorefrontCapabilityCategory[];
  subcategories: StorefrontCapabilitySubcategory[];
};

/** Minimal row shape for aggregation (DB or test fixtures). */
export type SupplierCapabilityRow = {
  categoryId: string;
  subcategory: string;
  brand: string;
  sourceUrl: string;
  confidence?: string | null;
};

export type AggregateSupplierCapabilitiesOptions = {
  /** When set, only rows with this marketplace categoryId are included. */
  categoryId?: string | null;
};
