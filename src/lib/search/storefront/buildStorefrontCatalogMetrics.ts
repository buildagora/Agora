import type { StorefrontCatalogMetrics, StorefrontSections } from "./types";

export function buildStorefrontCatalogMetrics(
  sections: StorefrontSections
): StorefrontCatalogMetrics {
  return {
    productCount: sections.products.length,
    brandCount: sections.brands.length,
    categoryCount: sections.categories.length,
  };
}
