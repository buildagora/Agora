import Link from "next/link";
import {
  buildStorefrontHref,
  storefrontFilterLabel,
  type StorefrontUrlParams,
} from "@/lib/search/storefront/storefrontNavigation";
import type { StorefrontEmptyStateHints, StorefrontTier } from "@/lib/search/storefront/types";
import { STOREFRONT_CARD } from "./storefrontUiTokens";

export default function EmptyStateSection({
  emptyState,
  supplierName,
  requestId,
  supplierId,
  urlParams,
  tier,
}: {
  emptyState: StorefrontEmptyStateHints;
  supplierName: string;
  requestId: string;
  supplierId: string;
  urlParams: StorefrontUrlParams;
  tier: StorefrontTier;
}) {
  if (emptyState.hasProducts) return null;

  const filterLabel = storefrontFilterLabel(urlParams);
  const hasFilters = Boolean(filterLabel);

  return (
    <section className={`${STOREFRONT_CARD} px-5 py-5`}>
      {hasFilters ? (
        <p className="text-sm text-zinc-700">
          No products matched{" "}
          <span className="font-medium text-zinc-900">{filterLabel}</span> at{" "}
          {supplierName}. Try another brand or category in the sidebar, or clear
          your filters.
        </p>
      ) : tier === "CAPABILITY" ? (
        <p className="text-sm text-zinc-700">
          Agora has not indexed product listings for {supplierName} yet. Use the
          sidebar to browse brands and categories, or contact the supplier using
          the header actions.
        </p>
      ) : emptyState.hasBrandsOrCategories ? (
        <p className="text-sm text-zinc-700">
          No live product listings matched your request at {supplierName}. Browse
          brands or categories in the sidebar to explore what they carry.
        </p>
      ) : (
        <p className="text-sm text-zinc-700">
          No verified product listings for this search at {supplierName} yet.
          Contact them using Call, Directions, or Website in the header.
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {hasFilters ? (
          <Link
            href={buildStorefrontHref(
              requestId,
              supplierId,
              { clearFilters: true, clearListing: true },
              urlParams
            )}
            className="inline-flex min-h-[44px] items-center justify-center rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-800 transition hover:border-zinc-300"
          >
            Clear filters
          </Link>
        ) : null}
      </div>
    </section>
  );
}
