import AttributeChipBar from "./AttributeChipBar";
import StorefrontCatalogShell from "./StorefrontCatalogShell";
import StorefrontProductGrid from "./StorefrontProductGrid";
import StorefrontRequestContextBar from "./StorefrontRequestContextBar";
import StorefrontViewTracker from "./StorefrontViewTracker";
import type { StorefrontUrlParams } from "@/lib/search/storefront/storefrontNavigation";
import type { SupplierStorefrontView } from "@/lib/search/storefront/types";

export default function SupplierStorefrontExperience({
  view,
  requestId,
  supplierId,
  urlParams,
  materialRequestText,
  productStatusLabel,
  fallbackPriceDisplay,
  listingTitle,
}: {
  view: SupplierStorefrontView;
  requestId: string;
  supplierId: string;
  urlParams: StorefrontUrlParams;
  materialRequestText: string;
  productStatusLabel: string;
  fallbackPriceDisplay: string;
  listingTitle?: string | null;
}) {
  const isExact = view.layoutMode === "PRODUCT_FIRST";
  const showExploration = !listingTitle;

  return (
    <div className="space-y-4 sm:space-y-5">
      <StorefrontViewTracker
        view={view}
        requestId={requestId}
        supplierId={supplierId}
      />

      {showExploration ? (
        <StorefrontRequestContextBar
          materialRequestText={materialRequestText}
          catalogMetrics={view.catalogMetrics}
          discoveryStatus={view.discoveryStatus}
          urlParams={urlParams}
          requestId={requestId}
          supplierId={supplierId}
          extractedAttributes={view.sections.extractedAttributes}
        />
      ) : null}

      {isExact ? (
        <AttributeChipBar attributes={view.sections.extractedAttributes} />
      ) : null}

      {showExploration ? (
        <StorefrontCatalogShell
          view={view}
          requestId={requestId}
          supplierId={supplierId}
          urlParams={urlParams}
          productStatusLabel={productStatusLabel}
          fallbackPriceDisplay={fallbackPriceDisplay}
        />
      ) : null}

      {listingTitle && isExact ? (
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
          title="Related products"
          description="Other options from this supplier."
        />
      ) : null}
    </div>
  );
}
