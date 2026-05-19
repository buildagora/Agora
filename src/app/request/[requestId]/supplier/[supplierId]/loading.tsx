/**
 * Shown automatically by Next.js while the supplier detail page server-
 * renders. That render does a live SerpAPI search per click (~5-15s
 * first time, faster on cache hits), so without a loading shell the user
 * sees nothing change for several seconds after clicking a card.
 */

import SiteFooter from "@/components/layout/SiteFooter";
import SiteHeader from "@/components/layout/SiteHeader";

export default function SupplierDetailLoading() {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <SiteHeader />

      <main className="flex-1 px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
        <div className="mx-auto w-full max-w-3xl">
          {/* Hero skeleton — supplier name + meta line */}
          <div className="mb-6 flex items-start gap-4">
            <div className="h-14 w-14 shrink-0 animate-pulse rounded-xl bg-zinc-100 ring-1 ring-zinc-200 sm:h-16 sm:w-16" />
            <div className="min-w-0 flex-1 space-y-2 pt-1">
              <div className="h-6 w-2/3 animate-pulse rounded bg-zinc-100" />
              <div className="h-3 w-1/2 animate-pulse rounded bg-zinc-100" />
            </div>
          </div>

          {/* Status banner */}
          <div className="mb-6 flex items-center gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3">
            <span className="flex h-2 w-2 shrink-0 items-center justify-center">
              <span className="absolute inline-flex h-2 w-2 animate-ping rounded-full bg-sky-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-sky-500" />
            </span>
            <p className="text-sm text-zinc-700">
              Fetching live product results from this supplier…
            </p>
          </div>

          {/* Product card skeletons */}
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
      </main>

      <SiteFooter />
    </div>
  );
}
