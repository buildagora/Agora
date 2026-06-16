/**
 * Shown while the supplier detail page server component loads.
 * Uses the same persistent chrome as the resolved page.
 */

import SupplierDetailPageShell from "./SupplierDetailPageShell";

export default function SupplierDetailLoading() {
  return (
    <SupplierDetailPageShell>
      <div className="px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
        <div className="mx-auto w-full max-w-6xl">
          <div className="mb-6 flex items-start gap-4">
            <div className="h-14 w-14 shrink-0 animate-pulse rounded-xl bg-zinc-100 ring-1 ring-zinc-200 sm:h-16 sm:w-16" />
            <div className="min-w-0 flex-1 space-y-2 pt-1">
              <div className="h-6 w-2/3 animate-pulse rounded bg-zinc-100" />
              <div className="h-3 w-1/2 animate-pulse rounded bg-zinc-100" />
            </div>
          </div>

          <div className="mb-6 flex items-center gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3">
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sky-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-sky-500" />
            </span>
            <p className="text-sm text-zinc-700">
              Fetching live product results from this supplier…
            </p>
          </div>

          <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-zinc-500">
            Loading products
          </h2>
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <li
                key={i}
                className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm"
              >
                <div className="mb-3 h-32 animate-pulse rounded-lg bg-zinc-100" />
                <div className="mb-2 h-4 w-3/4 animate-pulse rounded bg-zinc-100" />
                <div className="h-3 w-1/3 animate-pulse rounded bg-zinc-100" />
              </li>
            ))}
          </ul>
        </div>
      </div>
    </SupplierDetailPageShell>
  );
}
