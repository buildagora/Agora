import { discoveryStatusLabel } from "@/lib/search/storefront/resolveStorefrontTier";
import type { StorefrontDiscoveryStatus, StorefrontTier } from "@/lib/search/storefront/types";

export default function StorefrontCatalogStatusBanner({
  tier,
  discoveryStatus,
  supplierName,
  hasBrowseContent,
}: {
  tier: StorefrontTier;
  discoveryStatus: StorefrontDiscoveryStatus;
  supplierName: string;
  hasBrowseContent: boolean;
}) {
  if (tier === "READY" && discoveryStatus === "CATALOG_AVAILABLE") {
    return null;
  }

  const isCapability = tier === "CAPABILITY";

  return (
    <section className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700 sm:px-5">
      <p className="font-medium text-zinc-900">
        {isCapability
          ? `Agora is still building a live catalog for ${supplierName}.`
          : `Limited catalog data for ${supplierName}.`}
      </p>
      <p className="mt-1 text-zinc-600">
        {hasBrowseContent
          ? "Browse brands and categories below, or use the sidebar to refine. Contact the supplier from the header for pricing and availability."
          : "Use the header to call, get directions, or visit the supplier website."}
      </p>
      <p className="mt-2 text-xs text-zinc-500">
        {discoveryStatusLabel(discoveryStatus)}
      </p>
    </section>
  );
}
