import Link from "next/link";
import {
  buildStorefrontHref,
  storefrontFilterLabel,
  type StorefrontUrlParams,
} from "@/lib/search/storefront/storefrontNavigation";
import { discoveryStatusLabel } from "@/lib/search/storefront/resolveStorefrontTier";
import type {
  StorefrontCatalogMetrics,
  StorefrontDiscoveryStatus,
  StorefrontExtractedAttribute,
} from "@/lib/search/storefront/types";

export default function StorefrontRequestContextBar({
  materialRequestText,
  catalogMetrics,
  discoveryStatus,
  urlParams,
  requestId,
  supplierId,
  extractedAttributes = [],
}: {
  materialRequestText: string;
  catalogMetrics: StorefrontCatalogMetrics;
  discoveryStatus: StorefrontDiscoveryStatus;
  urlParams: StorefrontUrlParams;
  requestId: string;
  supplierId: string;
  extractedAttributes?: StorefrontExtractedAttribute[];
}) {
  const { brand, category } = urlParams;
  const filterLabel = storefrontFilterLabel(urlParams);
  const hasMetrics =
    catalogMetrics.productCount > 0 ||
    catalogMetrics.brandCount > 0 ||
    catalogMetrics.categoryCount > 0;

  return (
    <section className="sticky top-0 z-20 rounded-xl border border-zinc-200 bg-white/95 px-4 py-3 shadow-sm backdrop-blur sm:px-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">
            Request
          </p>
          <p className="truncate text-sm font-semibold text-zinc-900 sm:text-base">
            {materialRequestText}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <span className="inline-flex items-center rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800">
            {discoveryStatusLabel(discoveryStatus)}
          </span>
          {hasMetrics ? (
            <span className="text-xs text-zinc-500 sm:text-sm">
              {catalogMetrics.productCount > 0
                ? `${catalogMetrics.productCount} products`
                : null}
              {catalogMetrics.productCount > 0 && catalogMetrics.brandCount > 0
                ? " · "
                : null}
              {catalogMetrics.brandCount > 0
                ? `${catalogMetrics.brandCount} brands`
                : null}
              {(catalogMetrics.productCount > 0 || catalogMetrics.brandCount > 0) &&
              catalogMetrics.categoryCount > 0
                ? " · "
                : null}
              {catalogMetrics.categoryCount > 0
                ? `${catalogMetrics.categoryCount} categories`
                : null}
            </span>
          ) : null}
        </div>
      </div>

      {(brand || category || extractedAttributes.length > 0) && (
        <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-zinc-100 pt-2">
          <span className="text-xs font-medium text-zinc-500">Active filters</span>
          {brand ? (
            <Link
              href={buildStorefrontHref(
                requestId,
                supplierId,
                { clearBrand: true, clearListing: true },
                urlParams
              )}
              className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-0.5 text-xs text-zinc-800 hover:border-zinc-300"
            >
              Brand: {brand}
              <span aria-hidden className="text-zinc-400">
                ×
              </span>
            </Link>
          ) : null}
          {category ? (
            <Link
              href={buildStorefrontHref(
                requestId,
                supplierId,
                { clearCategory: true, clearListing: true },
                urlParams
              )}
              className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-0.5 text-xs text-zinc-800 hover:border-zinc-300"
            >
              Category: {category}
              <span aria-hidden className="text-zinc-400">
                ×
              </span>
            </Link>
          ) : null}
          {extractedAttributes.map((attr) => (
            <span
              key={`${attr.key}-${attr.value}`}
              className="inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-2.5 py-0.5 text-xs text-sky-900"
            >
              {attr.label}: {attr.value}
            </span>
          ))}
          {filterLabel ? (
            <Link
              href={buildStorefrontHref(
                requestId,
                supplierId,
                { clearFilters: true, clearListing: true },
                urlParams
              )}
              className="text-xs font-medium text-zinc-500 underline-offset-2 hover:text-zinc-800 hover:underline"
            >
              Clear all
            </Link>
          ) : null}
        </div>
      )}
    </section>
  );
}
