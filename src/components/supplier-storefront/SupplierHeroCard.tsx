import { Clock, MapPin, Phone } from "lucide-react";
import ImageWithFallback from "@/components/ImageWithFallback";
import { discoveryStatusLabel } from "@/lib/search/storefront/resolveStorefrontTier";
import type {
  StorefrontCatalogMetrics,
  StorefrontDiscoveryStatus,
} from "@/lib/search/storefront/types";
import StorefrontTrackedLink from "./StorefrontTrackedLink";

export default function SupplierHeroCard({
  supplierName,
  logoUrl,
  categoryLabel,
  distanceMiles,
  addressLine,
  phone,
  hoursText,
  availabilityLabel,
  availabilityClass,
  discoveryStatus,
  catalogMetrics,
  telHref,
  directionsHref,
  requestId,
  supplierId,
  tier,
}: {
  supplierName: string;
  logoUrl: string | null;
  categoryLabel: string;
  distanceMiles: number | null;
  addressLine: string | null;
  phone: string | null;
  hoursText: string | null;
  availabilityLabel: string;
  availabilityClass: string;
  discoveryStatus: StorefrontDiscoveryStatus;
  catalogMetrics: StorefrontCatalogMetrics;
  telHref: string | null;
  directionsHref: string | null;
  requestId: string;
  supplierId: string;
  tier: import("@/lib/search/storefront/types").StorefrontTier;
}) {
  const hasCatalogMetrics =
    catalogMetrics.productCount > 0 ||
    catalogMetrics.brandCount > 0 ||
    catalogMetrics.categoryCount > 0;

  return (
    <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white px-5 py-5 shadow-sm sm:px-6 sm:py-6 lg:sticky lg:top-0 lg:z-30">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 flex-1 gap-4">
          <ImageWithFallback
            src={logoUrl}
            alt={supplierName}
            className="h-16 w-28 shrink-0 rounded-xl border border-zinc-200 bg-white object-contain p-2"
            fallback={
              <span className="text-base font-semibold text-zinc-500">
                {supplierName.slice(0, 2).toUpperCase()}
              </span>
            }
            fallbackContainerClassName="flex items-center justify-center bg-white"
          />
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-bold tracking-tight text-zinc-900 sm:text-xl">
              {supplierName}
            </h1>
            <p className="mt-1 text-xs text-zinc-500 sm:text-sm">
              <span>{categoryLabel}</span>
              {distanceMiles != null ? (
                <>
                  <span className="mx-1.5 text-zinc-300" aria-hidden>
                    ·
                  </span>
                  <span className="text-zinc-400">{distanceMiles.toFixed(1)} mi away</span>
                </>
              ) : null}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex rounded-md border px-2 py-0.5 text-xs font-medium ${availabilityClass}`}
              >
                {availabilityLabel}
              </span>
              <span className="inline-flex rounded-md border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-xs font-medium text-zinc-700">
                {discoveryStatusLabel(discoveryStatus)}
              </span>
            </div>
            {hasCatalogMetrics ? (
              <p className="mt-2 text-xs text-zinc-500">
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
              </p>
            ) : null}
          </div>
        </div>

        {(telHref || directionsHref) && (
          <div className="flex shrink-0 flex-wrap gap-2">
            {telHref ? (
              <StorefrontTrackedLink
                href={telHref}
                requestId={requestId}
                supplierId={supplierId}
                tier={tier}
                kind="call"
                className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg border border-zinc-900 bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800"
              >
                <Phone className="h-4 w-4" aria-hidden />
                Call supplier
              </StorefrontTrackedLink>
            ) : null}
            {directionsHref ? (
              <StorefrontTrackedLink
                href={directionsHref}
                requestId={requestId}
                supplierId={supplierId}
                tier={tier}
                kind="directions"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg border border-zinc-200 bg-zinc-50/80 px-4 py-2 text-sm font-medium text-zinc-800 transition hover:border-zinc-300 hover:bg-zinc-100"
              >
                <MapPin className="h-4 w-4" aria-hidden />
                Directions
              </StorefrontTrackedLink>
            ) : null}
          </div>
        )}
      </div>

      <div className="mt-4 border-t border-zinc-100 pt-4">
        <div className="grid gap-3 text-xs text-zinc-600 sm:grid-cols-2 sm:gap-x-8 sm:gap-y-2 sm:text-sm">
          <div className="flex min-w-0 gap-2 sm:col-span-2">
            <Phone className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-400" aria-hidden />
            <p className="min-w-0 leading-snug">
              <span className="text-zinc-400">Phone </span>
              <span className="font-medium text-zinc-800">{phone?.trim() || "—"}</span>
            </p>
          </div>
          <div className="flex min-w-0 gap-2 sm:col-span-2">
            <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-400" aria-hidden />
            <p className="min-w-0 break-words leading-snug">
              <span className="text-zinc-400">Address </span>
              <span className="font-medium text-zinc-800">{addressLine || "—"}</span>
            </p>
          </div>
          <div className="flex min-w-0 gap-2 sm:col-span-2">
            <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-400" aria-hidden />
            <p className="min-w-0 whitespace-pre-wrap leading-snug">
              <span className="text-zinc-400">Hours </span>
              <span className="font-medium text-zinc-800">{hoursText?.trim() || "—"}</span>
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
