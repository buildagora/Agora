import type { SupplierProductResult } from "./types";

/**
 * Structured Serp organic site search buckets (PR 4).
 * `flat` matches legacy `searchSupplierSite()` ordering for backward compatibility.
 */
export type SupplierSiteSearchStructured = {
  products: SupplierProductResult[];
  categories: SupplierProductResult[];
  brands: SupplierProductResult[];
  other: SupplierProductResult[];
  flat: SupplierProductResult[];
};
