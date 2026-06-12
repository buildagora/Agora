"use client";

import { SlidersHorizontal, X } from "lucide-react";
import { useState } from "react";
import StorefrontSidebar, { storefrontSidebarHasContent } from "./StorefrontSidebar";
import type {
  StorefrontCategoryTreeNode,
  StorefrontFacetGroup,
  StorefrontNavItem,
  StorefrontSidebarSection,
  StorefrontTier,
} from "@/lib/search/storefront/types";
import type { StorefrontUrlParams } from "@/lib/search/storefront/storefrontNavigation";

export default function StorefrontFilterDrawer({
  categories,
  categoryTree,
  brands,
  facetGroups,
  sidebarOrder,
  brandProminence,
  requestId,
  supplierId,
  urlParams,
  tier,
  selectedAttributeFilters,
  onAttributeFilterToggle,
  onClearAttributeFilters,
}: {
  categories: StorefrontNavItem[];
  categoryTree: StorefrontCategoryTreeNode[];
  brands: StorefrontNavItem[];
  facetGroups: StorefrontFacetGroup[];
  sidebarOrder: StorefrontSidebarSection[];
  brandProminence: "high" | "medium" | "low";
  requestId: string;
  supplierId: string;
  urlParams: StorefrontUrlParams;
  tier: StorefrontTier;
  selectedAttributeFilters: Record<string, string>;
  onAttributeFilterToggle: (groupId: string, value: string) => void;
  onClearAttributeFilters: () => void;
}) {
  const [open, setOpen] = useState(false);
  const hasSidebar = storefrontSidebarHasContent({
    categories,
    categoryTree,
    brands,
    facetGroups,
    sidebarOrder,
  });
  const activeFilterCount =
    (urlParams.brand ? 1 : 0) +
    (urlParams.category ? 1 : 0) +
    Object.keys(selectedAttributeFilters).length;

  if (!hasSidebar) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-zinc-200 bg-white px-4 py-2.5 text-sm font-medium text-zinc-800 lg:hidden"
      >
        <SlidersHorizontal className="h-4 w-4" aria-hidden />
        Filters
        {activeFilterCount > 0 ? (
          <span className="rounded-full bg-zinc-900 px-2 py-0.5 text-xs text-white">
            {activeFilterCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label="Close filters"
            onClick={() => setOpen(false)}
          />
          <div className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-2xl bg-zinc-50 p-4 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold text-zinc-900">Filters</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-200"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <StorefrontSidebar
              categories={categories}
              categoryTree={categoryTree}
              brands={brands}
              facetGroups={facetGroups}
              sidebarOrder={sidebarOrder}
              brandProminence={brandProminence}
              requestId={requestId}
              supplierId={supplierId}
              urlParams={urlParams}
              tier={tier}
              selectedAttributeFilters={selectedAttributeFilters}
              onAttributeFilterToggle={(groupId, value) => {
                onAttributeFilterToggle(groupId, value);
              }}
              onClearAttributeFilters={onClearAttributeFilters}
            />
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="mt-4 w-full rounded-lg bg-zinc-900 px-4 py-3 text-sm font-medium text-white"
            >
              Apply filters
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
