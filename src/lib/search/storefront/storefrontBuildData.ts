import type { SupplierProductResult } from "@/lib/suppliers/types";
import type { SupplierCapabilityAggregate } from "./capabilityAggregateTypes";
import type { SupplierSiteSearchStructured } from "@/lib/suppliers/searchSupplierSiteTypes";

import type { StorefrontCatalogPageResult } from "./storefrontCatalogTypes";

/**
 * Pre-fetched inputs for {@link assembleSupplierStorefrontView} (tests + async builder).
 */
export type StorefrontBuildData = {
  capabilityAggregate: SupplierCapabilityAggregate | null;
  siteSearch: SupplierSiteSearchStructured | null;
  /** Router capability profile rows — empty when router flags off or no profile matches. */
  capabilityProfiles?: SupplierProductResult[];
  /** Paginated catalog page 1 — overrides siteSearch products when set. */
  catalogPage?: StorefrontCatalogPageResult | null;
};

export const EMPTY_STOREFRONT_BUILD_DATA: StorefrontBuildData = {
  capabilityAggregate: null,
  siteSearch: null,
  capabilityProfiles: [],
};
