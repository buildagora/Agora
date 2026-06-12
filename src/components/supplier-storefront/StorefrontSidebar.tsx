"use client";

import Link from "next/link";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";
import {
  trackStorefrontBrandClicked,
  trackStorefrontCategoryClicked,
  trackStorefrontFilterApplied,
} from "@/lib/analytics/storefrontAnalytics";
import {
  buildNavItemRefinementHref,
  buildStorefrontHref,
  type StorefrontUrlParams,
} from "@/lib/search/storefront/storefrontNavigation";
import type {
  StorefrontCategoryTreeNode,
  StorefrontFacetGroup,
  StorefrontNavItem,
  StorefrontSidebarSection,
  StorefrontTier,
} from "@/lib/search/storefront/types";
import StorefrontImage from "./StorefrontImage";

const TOP_BRANDS = 8;

function CategoryTreeSection({
  tree,
  flatCategories,
  requestId,
  supplierId,
  urlParams,
  tier,
  activeCategory,
}: {
  tree: StorefrontCategoryTreeNode[];
  flatCategories: StorefrontNavItem[];
  requestId: string;
  supplierId: string;
  urlParams: StorefrontUrlParams;
  tier: StorefrontTier;
  activeCategory?: string | null;
}) {
  const [expandedParents, setExpandedParents] = useState<Record<string, boolean>>({});

  const items = tree.length > 0 ? tree : null;

  if (!items && flatCategories.length === 0) return null;

  const toggleParent = (id: string) => {
    setExpandedParents((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
        Categories
      </p>
      {items ? (
        <ul className="mt-2 space-y-0.5">
          {items.map((parent) => {
            const hasChildren = parent.children.length > 0;
            const isExpanded = expandedParents[parent.id] ?? true;
            const isActive =
              activeCategory?.toLowerCase() === parent.label.toLowerCase();

            return (
              <li key={parent.id}>
                <div className="flex items-center gap-0.5">
                  {hasChildren ? (
                    <button
                      type="button"
                      onClick={() => toggleParent(parent.id)}
                      className="rounded p-0.5 text-zinc-400 hover:text-zinc-700"
                      aria-label={isExpanded ? "Collapse" : "Expand"}
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-3.5 w-3.5" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5" />
                      )}
                    </button>
                  ) : (
                    <span className="w-5" />
                  )}
                  <Link
                    href={
                      parent.href
                        ? parent.href
                        : buildNavItemRefinementHref(
                            requestId,
                            supplierId,
                            { label: parent.label, kind: "category" },
                            urlParams
                          )
                    }
                    onClick={() =>
                      trackStorefrontCategoryClicked({
                        requestId,
                        supplierId,
                        tier,
                        category: parent.label,
                      })
                    }
                    className={`flex flex-1 items-center justify-between rounded-md px-2 py-1.5 text-sm transition hover:bg-zinc-100 ${
                      isActive
                        ? "bg-zinc-100 font-medium text-zinc-900"
                        : "text-zinc-700"
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <StorefrontImage
                        slot="category"
                        label={parent.label}
                        variant="icon-only"
                        className="h-5 w-5 shrink-0"
                      />
                      {parent.label}
                    </span>
                    {parent.count != null ? (
                      <span className="text-xs text-zinc-400">{parent.count}</span>
                    ) : null}
                  </Link>
                </div>
                {hasChildren && isExpanded ? (
                  <ul className="ml-6 mt-0.5 space-y-0.5 border-l border-zinc-100 pl-2">
                    {parent.children.map((child) => (
                      <li key={child.id}>
                        <Link
                          href={
                            child.href ??
                            buildNavItemRefinementHref(
                              requestId,
                              supplierId,
                              { label: child.label, kind: "category" },
                              urlParams
                            )
                          }
                          onClick={() =>
                            trackStorefrontCategoryClicked({
                              requestId,
                              supplierId,
                              tier,
                              category: child.label,
                            })
                          }
                          className="flex items-center justify-between rounded-md px-2 py-1 text-sm text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-900"
                        >
                          {child.label}
                          {child.count != null ? (
                            <span className="text-xs text-zinc-400">
                              {child.count}
                            </span>
                          ) : null}
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <ul className="mt-2 space-y-0.5">
          {flatCategories.map((item) => (
            <li key={item.id}>
              <Link
                href={buildNavItemRefinementHref(
                  requestId,
                  supplierId,
                  item,
                  urlParams
                )}
                onClick={() =>
                  trackStorefrontCategoryClicked({
                    requestId,
                    supplierId,
                    tier,
                    category: item.label,
                  })
                }
                className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm text-zinc-700 transition hover:bg-zinc-100"
              >
                {item.label}
                {item.count != null ? (
                  <span className="text-xs text-zinc-400">{item.count}</span>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function BrandFilters({
  items,
  requestId,
  supplierId,
  urlParams,
  tier,
  activeBrand,
  prominence,
}: {
  items: StorefrontNavItem[];
  requestId: string;
  supplierId: string;
  urlParams: StorefrontUrlParams;
  tier: StorefrontTier;
  activeBrand?: string | null;
  prominence: "high" | "medium" | "low";
}) {
  const [showAll, setShowAll] = useState(false);

  if (items.length === 0) return null;

  const visible = showAll ? items : items.slice(0, TOP_BRANDS);

  return (
    <div className={prominence === "high" ? "order-first" : undefined}>
      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
        Brands
      </p>
      <ul className="mt-2 space-y-1">
        {visible.map((item) => {
          const isActive = activeBrand?.toLowerCase() === item.label.toLowerCase();
          return (
            <li key={item.id}>
              <Link
                href={buildNavItemRefinementHref(
                  requestId,
                  supplierId,
                  item,
                  urlParams
                )}
                onClick={() =>
                  trackStorefrontBrandClicked({
                    requestId,
                    supplierId,
                    tier,
                    brand: item.label,
                  })
                }
                className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition hover:bg-zinc-100 ${
                  isActive ? "bg-zinc-100 font-medium text-zinc-900" : "text-zinc-700"
                }`}
              >
                <StorefrontImage
                  slot="brand"
                  label={item.label}
                  variant="icon-only"
                  className="h-5 w-5 shrink-0"
                />
                <span className="flex-1">{item.label}</span>
                {item.count != null ? (
                  <span className="text-xs text-zinc-400">{item.count}</span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
      {items.length > TOP_BRANDS ? (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="mt-2 text-xs font-medium text-zinc-500 hover:text-zinc-800"
        >
          {showAll ? "Show less" : `Show more (${items.length - TOP_BRANDS})`}
        </button>
      ) : null}
    </div>
  );
}

function AttributeFilters({
  facetGroups,
  selectedFilters,
  onToggle,
  requestId,
  supplierId,
  tier,
}: {
  facetGroups: StorefrontFacetGroup[];
  selectedFilters: Record<string, string>;
  onToggle: (groupId: string, value: string) => void;
  requestId: string;
  supplierId: string;
  tier: StorefrontTier;
}) {
  if (facetGroups.length === 0) return null;

  return (
    <>
      {facetGroups.map((group) => (
        <div key={group.id}>
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            {group.label}
          </p>
          <ul className="mt-2 space-y-1">
            {group.values.map((value) => {
              const isActive = selectedFilters[group.id] === value.label;
              return (
                <li key={value.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onToggle(group.id, value.label);
                      trackStorefrontFilterApplied({
                        requestId,
                        supplierId,
                        tier,
                        filterType: group.id,
                        filterValue: value.label,
                      });
                    }}
                    className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm transition hover:bg-zinc-100 ${
                      isActive
                        ? "bg-zinc-100 font-medium text-zinc-900"
                        : "text-zinc-700"
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <span
                        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                          isActive
                            ? "border-zinc-900 bg-zinc-900 text-white"
                            : "border-zinc-300 bg-white"
                        }`}
                        aria-hidden
                      >
                        {isActive ? "✓" : ""}
                      </span>
                      {value.label}
                    </span>
                    {value.count != null ? (
                      <span className="text-xs text-zinc-400">{value.count}</span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </>
  );
}

function sidebarSectionHasContent(
  section: StorefrontSidebarSection,
  props: {
    categories: StorefrontNavItem[];
    categoryTree: StorefrontCategoryTreeNode[];
    brands: StorefrontNavItem[];
    facetGroups: StorefrontFacetGroup[];
  }
): boolean {
  switch (section) {
    case "categories":
      return props.categoryTree.length > 0 || props.categories.length > 0;
    case "brands":
      return props.brands.length > 0;
    case "attributes":
      return props.facetGroups.some((g) => g.values.length > 0);
    default:
      return false;
  }
}

export function storefrontSidebarHasContent(input: {
  categories: StorefrontNavItem[];
  categoryTree: StorefrontCategoryTreeNode[];
  brands: StorefrontNavItem[];
  facetGroups: StorefrontFacetGroup[];
  sidebarOrder: StorefrontSidebarSection[];
}): boolean {
  const props = {
    categories: input.categories,
    categoryTree: input.categoryTree,
    brands: input.brands,
    facetGroups: input.facetGroups,
  };
  return input.sidebarOrder.some((section) =>
    sidebarSectionHasContent(section, props)
  );
}

function renderSidebarSection(
  section: StorefrontSidebarSection,
  props: {
    categories: StorefrontNavItem[];
    categoryTree: StorefrontCategoryTreeNode[];
    brands: StorefrontNavItem[];
    facetGroups: StorefrontFacetGroup[];
    requestId: string;
    supplierId: string;
    urlParams: StorefrontUrlParams;
    tier: StorefrontTier;
    selectedAttributeFilters: Record<string, string>;
    onAttributeFilterToggle: (groupId: string, value: string) => void;
    brandProminence: "high" | "medium" | "low";
  }
) {
  switch (section) {
    case "categories":
      return (
        <CategoryTreeSection
          key="categories"
          tree={props.categoryTree}
          flatCategories={props.categories}
          requestId={props.requestId}
          supplierId={props.supplierId}
          urlParams={props.urlParams}
          tier={props.tier}
          activeCategory={props.urlParams.category}
        />
      );
    case "brands":
      return (
        <BrandFilters
          key="brands"
          items={props.brands}
          requestId={props.requestId}
          supplierId={props.supplierId}
          urlParams={props.urlParams}
          tier={props.tier}
          activeBrand={props.urlParams.brand}
          prominence={props.brandProminence}
        />
      );
    case "attributes":
      return (
        <AttributeFilters
          key="attributes"
          facetGroups={props.facetGroups}
          selectedFilters={props.selectedAttributeFilters}
          onToggle={props.onAttributeFilterToggle}
          requestId={props.requestId}
          supplierId={props.supplierId}
          tier={props.tier}
        />
      );
    default:
      return null;
  }
}

export default function StorefrontSidebar({
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
  className,
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
  className?: string;
}) {
  const hasAttributeFilters = Object.keys(selectedAttributeFilters).length > 0;
  const sectionProps = {
    categories,
    categoryTree,
    brands,
    facetGroups,
    requestId,
    supplierId,
    urlParams,
    tier,
    selectedAttributeFilters,
    onAttributeFilterToggle,
    brandProminence,
  };

  const visibleSections = sidebarOrder
    .map((section) => renderSidebarSection(section, sectionProps))
    .filter(Boolean);

  if (visibleSections.length === 0 && !urlParams.brand && !urlParams.category) {
    return null;
  }

  return (
    <aside
      className={`space-y-5 rounded-xl border border-zinc-200 bg-white p-4 ${className ?? ""}`}
    >
      {visibleSections}

      {(urlParams.brand || urlParams.category || hasAttributeFilters) && (
        <div className="border-t border-zinc-100 pt-3">
          {urlParams.brand || urlParams.category ? (
            <Link
              href={buildStorefrontHref(
                requestId,
                supplierId,
                { clearFilters: true, clearListing: true },
                urlParams
              )}
              className="text-xs font-medium text-zinc-500 underline-offset-2 hover:text-zinc-800 hover:underline"
            >
              Clear URL filters
            </Link>
          ) : null}
          {hasAttributeFilters ? (
            <button
              type="button"
              onClick={onClearAttributeFilters}
              className="ml-3 text-xs font-medium text-zinc-500 hover:text-zinc-800"
            >
              Clear attribute filters
            </button>
          ) : null}
        </div>
      )}
    </aside>
  );
}
