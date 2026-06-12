import Link from "next/link";
import {
  buildStorefrontHref,
  type StorefrontUrlParams,
} from "@/lib/search/storefront/storefrontNavigation";

export default function StorefrontActiveFilters({
  requestId,
  supplierId,
  urlParams,
}: {
  requestId: string;
  supplierId: string;
  urlParams: StorefrontUrlParams;
}) {
  const { brand, category } = urlParams;
  if (!brand && !category) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-medium text-zinc-500 sm:text-sm">Filters</span>
      {brand ? (
        <Link
          href={buildStorefrontHref(
            requestId,
            supplierId,
            { clearBrand: true, clearListing: true },
            urlParams
          )}
          className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-white px-3 py-1 text-sm text-zinc-800 transition hover:border-zinc-300 hover:bg-zinc-50"
        >
          <span className="text-zinc-500">Brand:</span>
          <span className="font-medium">{brand}</span>
          <span className="text-zinc-400" aria-hidden>
            ×
          </span>
          <span className="sr-only">Remove brand filter</span>
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
          className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-white px-3 py-1 text-sm text-zinc-800 transition hover:border-zinc-300 hover:bg-zinc-50"
        >
          <span className="text-zinc-500">Category:</span>
          <span className="font-medium">{category}</span>
          <span className="text-zinc-400" aria-hidden>
            ×
          </span>
          <span className="sr-only">Remove category filter</span>
        </Link>
      ) : null}
      {brand && category ? (
        <Link
          href={buildStorefrontHref(
            requestId,
            supplierId,
            { clearFilters: true, clearListing: true },
            urlParams
          )}
          className="text-xs font-medium text-zinc-500 underline-offset-2 hover:text-zinc-800 hover:underline sm:text-sm"
        >
          Clear all
        </Link>
      ) : null}
    </div>
  );
}
