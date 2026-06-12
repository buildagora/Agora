"use client";

import { useCallback, useMemo, useState } from "react";
import type { StorefrontUrlParams } from "@/lib/search/storefront/storefrontNavigation";
import type { SupplierStorefrontView } from "@/lib/search/storefront/types";
import StorefrontFilterDrawer from "./StorefrontFilterDrawer";
import StorefrontMainContent from "./StorefrontMainContent";
import StorefrontSidebar, { storefrontSidebarHasContent } from "./StorefrontSidebar";

/**
 * Unified Agora storefront shell — same layout for READY, PARTIAL, and CAPABILITY tiers.
 */
export default function StorefrontCatalogShell({
  view,
  requestId,
  supplierId,
  urlParams,
  productStatusLabel,
  fallbackPriceDisplay,
}: {
  view: SupplierStorefrontView;
  requestId: string;
  supplierId: string;
  urlParams: StorefrontUrlParams;
  productStatusLabel: string;
  fallbackPriceDisplay: string;
}) {
  const [attributeFilters, setAttributeFilters] = useState<Record<string, string>>({});

  const toggleAttributeFilter = useCallback((groupId: string, value: string) => {
    setAttributeFilters((prev) => {
      if (prev[groupId] === value) {
        const next = { ...prev };
        delete next[groupId];
        return next;
      }
      return { ...prev, [groupId]: value };
    });
  }, []);

  const clearAttributeFilters = useCallback(() => {
    setAttributeFilters({});
  }, []);

  const sidebarProps = useMemo(
    () => ({
      categories: view.sections.categories,
      categoryTree: view.sections.categoryTree,
      brands: view.sections.brands,
      facetGroups: view.sections.facetGroups,
      sidebarOrder: view.presentation.sidebarOrder,
      brandProminence: view.presentation.brandProminence,
      requestId,
      supplierId,
      urlParams,
      tier: view.tier,
      selectedAttributeFilters: attributeFilters,
      onAttributeFilterToggle: toggleAttributeFilter,
      onClearAttributeFilters: clearAttributeFilters,
    }),
    [attributeFilters, requestId, supplierId, urlParams, view]
  );

  const showSidebar = storefrontSidebarHasContent(sidebarProps);

  return (
    <div className="space-y-4">
      <StorefrontFilterDrawer {...sidebarProps} />

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        {showSidebar ? (
          <StorefrontSidebar
            {...sidebarProps}
            className="hidden lg:block lg:w-64 lg:shrink-0"
          />
        ) : null}

        <StorefrontMainContent
          view={view}
          requestId={requestId}
          supplierId={supplierId}
          urlParams={urlParams}
          productStatusLabel={productStatusLabel}
          fallbackPriceDisplay={fallbackPriceDisplay}
          attributeFilters={attributeFilters}
        />
      </div>
    </div>
  );
}
