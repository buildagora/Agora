"use client";

import { useCallback, useMemo, useState } from "react";
import { trackStorefrontLoadMoreClicked } from "@/lib/analytics/storefrontAnalytics";
import { filterProductsByAttributes } from "@/lib/search/storefront/filterProductsByAttributes";
import {
  STOREFRONT_INITIAL_PAGE_SIZE,
  STOREFRONT_LOAD_MORE_SIZE,
} from "@/lib/search/storefront/storefrontCatalogConstants";
import type { StorefrontCatalogPagination } from "@/lib/search/storefront/storefrontCatalogTypes";
import type { StorefrontUrlParams } from "@/lib/search/storefront/storefrontNavigation";
import type { StorefrontTier } from "@/lib/search/storefront/types";
import type { SupplierProductResult } from "@/lib/suppliers/types";
import StorefrontProductCard from "./StorefrontProductCard";

function gridColumnClass(columns: 2 | 3 | 4): string {
  if (columns === 2) return "grid-cols-2";
  if (columns === 3) return "grid-cols-2 sm:grid-cols-3";
  return "grid-cols-2 sm:gap-4 lg:grid-cols-4";
}

export default function StorefrontProductGrid({
  products: initialProducts,
  requestId,
  supplierId,
  urlParams,
  tier,
  productSearchQuery,
  catalogPagination,
  gridColumns = 4,
  productStatusLabel,
  fallbackPriceDisplay,
  title = "Products",
  description,
  attributeFilters = {},
}: {
  products: SupplierProductResult[];
  requestId: string;
  supplierId: string;
  urlParams: StorefrontUrlParams;
  tier: StorefrontTier;
  productSearchQuery: string;
  catalogPagination: StorefrontCatalogPagination;
  gridColumns?: 2 | 3 | 4;
  productStatusLabel: string;
  fallbackPriceDisplay: string;
  title?: string;
  description?: string;
  attributeFilters?: Record<string, string>;
}) {
  const [products, setProducts] = useState(initialProducts);
  const [pagination, setPagination] = useState(catalogPagination);
  const [loading, setLoading] = useState(false);

  const filtered = useMemo(
    () => filterProductsByAttributes(products, attributeFilters),
    [products, attributeFilters]
  );

  const totalDisplay =
    pagination.totalCount != null ? pagination.totalCount : filtered.length;
  const hasMore = pagination.hasMore;

  const loadMore = useCallback(async () => {
    if (loading || !hasMore) return;
    setLoading(true);
    try {
      const nextPage = pagination.page + 1;
      const params = new URLSearchParams({
        supplier: supplierId,
        query: productSearchQuery,
        page: String(nextPage),
        pageSize: String(pagination.pageSize || STOREFRONT_LOAD_MORE_SIZE),
      });
      if (urlParams.brand) params.set("brand", urlParams.brand);
      if (urlParams.category) params.set("category", urlParams.category);
      for (const [key, value] of Object.entries(attributeFilters)) {
        params.set(`attr.${key}`, value);
      }

      const res = await fetch(`/api/storefront/catalog?${params.toString()}`);
      if (!res.ok) return;
      const data = (await res.json()) as {
        products: SupplierProductResult[];
        totalCount: number | null;
        hasMore: boolean;
        page: number;
        pageSize: number;
      };

      setProducts((prev) => {
        const seen = new Set(prev.map((p) => p.productUrl ?? p.title));
        const merged = [...prev];
        for (const row of data.products) {
          const key = row.productUrl ?? row.title;
          if (seen.has(key)) continue;
          seen.add(key);
          merged.push(row);
        }
        return merged;
      });
      setPagination({
        page: data.page,
        pageSize: data.pageSize,
        totalCount: data.totalCount,
        hasMore: data.hasMore,
      });
      trackStorefrontLoadMoreClicked({
        requestId,
        supplierId,
        tier,
        visibleCount: products.length + data.products.length,
        totalCount: data.totalCount ?? filtered.length,
      });
    } finally {
      setLoading(false);
    }
  }, [
    attributeFilters,
    filtered.length,
    hasMore,
    loading,
    pagination.page,
    pagination.pageSize,
    productSearchQuery,
    products.length,
    requestId,
    supplierId,
    tier,
    urlParams.brand,
    urlParams.category,
  ]);

  if (filtered.length === 0) return null;

  return (
    <section className="min-w-0 flex-1">
      <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-zinc-900 sm:text-lg">{title}</h2>
          {description ? (
            <p className="mt-0.5 text-sm text-zinc-500">{description}</p>
          ) : null}
        </div>
        <p className="text-xs text-zinc-500 sm:text-sm">
          Showing {filtered.length}
          {totalDisplay > filtered.length || pagination.totalCount != null
            ? ` of ${totalDisplay}`
            : ""}
        </p>
      </div>

      <div className={`grid gap-3 sm:gap-4 ${gridColumnClass(gridColumns)}`}>
        {filtered.map((product, index) => (
          <StorefrontProductCard
            key={`${product.title}-${product.productUrl ?? index}`}
            product={product}
            index={index}
            requestId={requestId}
            supplierId={supplierId}
            urlParams={urlParams}
            tier={tier}
            productStatusLabel={productStatusLabel}
            fallbackPriceDisplay={fallbackPriceDisplay}
          />
        ))}
      </div>

      {hasMore ? (
        <button
          type="button"
          disabled={loading}
          onClick={() => void loadMore()}
          className="mt-6 w-full rounded-lg border border-zinc-200 bg-white px-4 py-3 text-sm font-medium text-zinc-800 transition hover:border-zinc-300 hover:bg-zinc-50 disabled:opacity-60"
        >
          {loading ? "Loading…" : "Load more"}
        </button>
      ) : null}
    </section>
  );
}
