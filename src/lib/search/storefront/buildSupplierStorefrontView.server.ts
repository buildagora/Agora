import { getPrisma } from "@/lib/db.server";
import { partitionDiscoveryResults } from "@/lib/suppliers/capability/partitionDiscoveryResults";
import { searchSupplierDiscoveryForSupplier } from "@/lib/suppliers/resolveSupplierDiscovery";
import {
  isFingerprintRouterEnabled,
  isSupplierAllowlisted,
} from "@/lib/suppliers/routing/routerFlags";
import { aggregateSupplierCapabilities } from "./aggregateSupplierCapabilities.server";
import { assembleSupplierStorefrontView } from "./buildSupplierStorefrontView";
import { fetchStorefrontCatalogPage } from "./fetchStorefrontCatalogPage.server";
import { fetchSupplierSiteSearchForStorefront } from "./fetchSupplierSiteSearchForStorefront.server";
import { STOREFRONT_INITIAL_PAGE_SIZE } from "./storefrontCatalogConstants";
import { isCapabilityTier, lookupStorefrontTier } from "./resolveStorefrontTier";
import type { StorefrontBuildData } from "./storefrontBuildData";
import type { BuildSupplierStorefrontViewInput, SupplierStorefrontView } from "./types";

export type BuildSupplierStorefrontViewOptions = {
  /** When true, skip Serp / adapter calls (capabilities only). */
  skipSiteSearch?: boolean;
  /** When true, skip capability DB load. */
  skipCapabilities?: boolean;
};

async function fetchCapabilityProfilesForStorefront(
  supplierId: string,
  productSearchQuery: string
): Promise<StorefrontBuildData["capabilityProfiles"]> {
  if (!isFingerprintRouterEnabled() || !isSupplierAllowlisted(supplierId)) {
    return [];
  }

  const q = productSearchQuery.trim();
  if (!q) return [];

  const prisma = getPrisma();
  const supplier = await prisma.supplier.findUnique({
    where: { id: supplierId },
    select: { domain: true },
  });

  const discoveryResults = await searchSupplierDiscoveryForSupplier(
    supplierId,
    q,
    supplier?.domain,
    { entryPoint: "supplier_detail" }
  );

  return partitionDiscoveryResults(discoveryResults).capabilityProfiles;
}

/**
 * Builds a complete supplier storefront view: layout, attributes, capabilities, Serp.
 * Used by supplier detail (`DeepSupplierDetail`).
 */
export async function buildSupplierStorefrontView(
  input: BuildSupplierStorefrontViewInput,
  options: BuildSupplierStorefrontViewOptions = {}
): Promise<SupplierStorefrontView> {
  const supplierId = input.supplier.id;
  const tier = lookupStorefrontTier(supplierId);
  const skipSiteSearch =
    options.skipSiteSearch === true || isCapabilityTier(tier);

  const [capabilityAggregate, siteSearch, capabilityProfiles, catalogPage] =
    await Promise.all([
    options.skipCapabilities
      ? Promise.resolve(null)
      : aggregateSupplierCapabilities(supplierId, {
          categoryId: input.categoryId,
        }),
    skipSiteSearch
      ? Promise.resolve(null)
      : fetchSupplierSiteSearchForStorefront(
          supplierId,
          input.productSearchQuery,
          input.supplier.name
        ),
    skipSiteSearch
      ? Promise.resolve([])
      : fetchCapabilityProfilesForStorefront(
          supplierId,
          input.productSearchQuery
        ),
    skipSiteSearch
      ? Promise.resolve(null)
      : fetchStorefrontCatalogPage({
          supplierId,
          productSearchQuery: input.productSearchQuery,
          page: 1,
          pageSize: STOREFRONT_INITIAL_PAGE_SIZE,
          logLabel: input.supplier.name,
        }),
  ]);

  const data: StorefrontBuildData = {
    capabilityAggregate,
    siteSearch,
    capabilityProfiles,
    catalogPage,
  };
  return assembleSupplierStorefrontView(input, data);
}
