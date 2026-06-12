"use client";

import { buildCapabilityBrowseItems } from "@/lib/search/storefront/buildCapabilityBrowseItems";
import { resolveStorefrontMainContentMode } from "@/lib/search/storefront/resolveStorefrontMainContentMode";
import { filterProductsByAttributes } from "@/lib/search/storefront/filterProductsByAttributes";
import type { StorefrontUrlParams } from "@/lib/search/storefront/storefrontNavigation";
import type { SupplierStorefrontView } from "@/lib/search/storefront/types";
import EmptyStateSection from "./EmptyStateSection";
import StorefrontBrowseGrid from "./StorefrontBrowseGrid";
import StorefrontCatalogStatusBanner from "./StorefrontCatalogStatusBanner";
import StorefrontProductGrid from "./StorefrontProductGrid";

export default function StorefrontMainContent({
  view,
  requestId,
  supplierId,
  urlParams,
  productStatusLabel,
  fallbackPriceDisplay,
  attributeFilters,
}: {
  view: SupplierStorefrontView;
  requestId: string;
  supplierId: string;
  urlParams: StorefrontUrlParams;
  productStatusLabel: string;
  fallbackPriceDisplay: string;
  attributeFilters: Record<string, string>;
}) {
  const productCount = view.sections.products.length;
  const profileCount = view.sections.capabilityProfiles.length;
  const mode = resolveStorefrontMainContentMode({
    tier: view.tier,
    productCount,
    capabilityProfileCount: profileCount,
  });

  const browseItems = buildCapabilityBrowseItems(view, urlParams);
  const hasBrowseContent = browseItems.length > 0;

  const filteredProducts = filterProductsByAttributes(
    view.sections.products,
    attributeFilters
  );
  const showProductGrid =
    (mode === "LIVE_PRODUCTS" || mode === "HYBRID") && filteredProducts.length > 0;

  const showBrowseGrid =
    mode === "CAPABILITY_BROWSE" ||
    (hasBrowseContent && (mode === "HYBRID" || !showProductGrid));

  const showEmptyHint = !showProductGrid && !showBrowseGrid;

  return (
    <div className="min-w-0 flex-1 space-y-5">
      <StorefrontCatalogStatusBanner
        tier={view.tier}
        discoveryStatus={view.discoveryStatus}
        supplierName={view.supplier.name}
        hasBrowseContent={hasBrowseContent}
      />

      {showProductGrid ? (
        <StorefrontProductGrid
          products={view.sections.products}
          requestId={requestId}
          supplierId={supplierId}
          urlParams={urlParams}
          tier={view.tier}
          productSearchQuery={view.productSearchQuery}
          catalogPagination={view.catalogPagination}
          gridColumns={view.presentation.gridColumns}
          productStatusLabel={productStatusLabel}
          fallbackPriceDisplay={fallbackPriceDisplay}
          title={mode === "HYBRID" ? "Live catalog results" : "Products"}
          description={
            mode === "HYBRID"
              ? "Verified product listings from this supplier."
              : "Browse live catalog results for your request."
          }
          attributeFilters={attributeFilters}
        />
      ) : null}

      {filteredProducts.length === 0 && productCount > 0 ? (
        <p className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-600">
          No products match the selected filters. Try clearing filters in the sidebar.
        </p>
      ) : null}

      {showBrowseGrid ? (
        <StorefrontBrowseGrid
          view={view}
          requestId={requestId}
          supplierId={supplierId}
          urlParams={urlParams}
          title={
            mode === "HYBRID" && showProductGrid
              ? "Also browse at this supplier"
              : mode === "CAPABILITY_BROWSE"
                ? "Browse this supplier"
                : "Browse brands & categories"
          }
          description={
            mode === "CAPABILITY_BROWSE"
              ? "Select a brand or category to explore likely product lines. Not live inventory."
              : "Explore brands and categories this supplier serves."
          }
        />
      ) : null}

      {showEmptyHint ? (
        <EmptyStateSection
          emptyState={view.emptyState}
          supplierName={view.supplier.name}
          requestId={requestId}
          supplierId={supplierId}
          urlParams={urlParams}
          tier={view.tier}
        />
      ) : null}
    </div>
  );
}
