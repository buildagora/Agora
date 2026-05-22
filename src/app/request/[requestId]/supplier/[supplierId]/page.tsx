/**
 * Streaming wrapper around DeepSupplierDetail.
 *
 * The inner page does a live SerpAPI search per click (5-15s cold,
 * sub-second after the cache pre-warm we fire from the chat search step).
 * Wrapping it in Suspense lets us:
 *   1. Run a fast supplier+request lookup (~80ms total) to render a real
 *      page shell — with the supplier's actual name, logo, and address —
 *      immediately, so the buyer can confirm they clicked the right card.
 *   2. Stream the slow SerpAPI-backed content into a Suspense boundary,
 *      with a product-shaped skeleton in place while it loads.
 *
 * Compared to relying on loading.tsx alone (which shows a generic skeleton
 * before the page starts rendering), this gives the buyer specific
 * confirmation in ~100ms.
 */

import { Suspense } from "react";
import { notFound } from "next/navigation";
import SiteFooter from "@/components/layout/SiteFooter";
import SiteHeader from "@/components/layout/SiteHeader";
import { getPrisma } from "@/lib/db.rsc";
import BackToSearchLink, { buildSearchBackHref } from "./BackToSearchLink";
import DeepSupplierDetail from "./DeepSupplierDetail";

export const revalidate = 0;

type PageProps = {
  params: Promise<{ requestId: string; supplierId: string }>;
  searchParams?: Promise<{
    q?: string;
    listingTitle?: string;
    listingImage?: string;
    listingPrice?: string;
    listingUrl?: string;
    fromThread?: string;
    fromSearch?: string;
  }>;
};

export default async function PublicSupplierDetailPage(props: PageProps) {
  const { requestId, supplierId } = await props.params;
  if (!requestId || !supplierId) notFound();

  const sp = props.searchParams ? await props.searchParams : undefined;
  const backHref = buildSearchBackHref(sp?.fromThread, sp?.fromSearch);

  const prisma = getPrisma();
  const supplier = await prisma.supplier.findUnique({
    where: { id: supplierId },
    select: {
      id: true,
      name: true,
      street: true,
      city: true,
      state: true,
      zip: true,
      logoUrl: true,
    },
  });
  if (!supplier) notFound();

  return (
    <Suspense fallback={<ShellWithSupplier supplier={supplier} backHref={backHref} />}>
      <DeepSupplierDetail {...props} />
    </Suspense>
  );
}


type ShellSupplier = {
  name: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  logoUrl: string | null;
};

/**
 * Page shell shown while the heavy page is still server-rendering. Includes
 * the supplier hero (logo + name + address) so the buyer immediately knows
 * they clicked the right card, plus a product-section skeleton.
 */
function ShellWithSupplier({
  supplier,
  backHref,
}: {
  supplier: ShellSupplier;
  backHref: string | null;
}) {
  const initials = supplier.name
    .replace(/[^\w\s]/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <SiteHeader />

      <main className="flex-1 px-4 py-6 sm:px-6 sm:py-10 lg:px-8">
        <div className="mx-auto w-full max-w-3xl">
          {backHref && <BackToSearchLink href={backHref} />}

          {/* Real supplier hero — name, logo, address */}
          <div className="mb-6 flex items-start gap-4">
            {supplier.logoUrl ? (
              <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-zinc-50 ring-1 ring-zinc-200 sm:h-16 sm:w-16">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={supplier.logoUrl}
                  alt=""
                  className="h-full w-full object-contain p-1"
                />
              </div>
            ) : (
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-zinc-50 text-base font-semibold text-zinc-600 ring-1 ring-zinc-200 sm:h-16 sm:w-16">
                {initials || "?"}
              </div>
            )}
            <div className="min-w-0 flex-1 pt-1">
              <h1 className="truncate text-xl font-semibold text-zinc-900 sm:text-2xl">
                {supplier.name}
              </h1>
              <p className="mt-1 truncate text-sm text-zinc-500">
                {supplier.street}, {supplier.city}, {supplier.state} {supplier.zip}
              </p>
            </div>
          </div>

          {/* Live-fetching banner */}
          <div className="relative mb-6 flex items-center gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3">
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sky-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-sky-500" />
            </span>
            <p className="text-sm text-zinc-700">
              Fetching live product results from {supplier.name}…
            </p>
          </div>

          {/* Product-shape skeletons */}
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
