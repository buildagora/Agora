"use client";

import Link from "next/link";
import { Phone } from "lucide-react";
import { useEffect } from "react";
import {
  trackStorefrontImageFallback,
  trackStorefrontProductCardViewed,
  trackStorefrontProductDetailViewed,
} from "@/lib/analytics/storefrontAnalytics";
import { resolveStorefrontDisplayImage } from "@/lib/search/storefront/resolveStorefrontDisplayImage";
import { buildListingDrillHref } from "@/lib/search/storefront/storefrontNavigation";
import type { StorefrontUrlParams } from "@/lib/search/storefront/storefrontNavigation";
import type { StorefrontTier } from "@/lib/search/storefront/types";
import type { SupplierProductResult } from "@/lib/suppliers/types";
import StorefrontProductCardImage from "./StorefrontProductCardImage";

function confidenceChipClass(label: string): string {
  const lower = label.toLowerCase();
  if (lower.includes("catalog") || lower.includes("carries")) {
    return "border-emerald-200 bg-emerald-50 text-emerald-800";
  }
  if (lower.includes("likely")) {
    return "border-sky-200 bg-sky-50 text-sky-900";
  }
  if (lower.includes("stock")) {
    return "border-emerald-200 bg-emerald-50 text-emerald-800";
  }
  return "border-amber-200 bg-amber-50 text-amber-800";
}

export default function StorefrontProductCard({
  product,
  index,
  requestId,
  supplierId,
  urlParams,
  tier,
  productStatusLabel,
  fallbackPriceDisplay,
}: {
  product: SupplierProductResult;
  index: number;
  requestId: string;
  supplierId: string;
  urlParams: StorefrontUrlParams;
  tier: StorefrontTier;
  productStatusLabel: string;
  fallbackPriceDisplay: string;
}) {
  const detailHref = buildListingDrillHref(
    requestId,
    supplierId,
    {
      title: product.title,
      imageUrl: product.imageUrl ?? null,
      price: product.price ?? null,
      productUrl: product.productUrl ?? null,
    },
    urlParams
  );

  useEffect(() => {
    trackStorefrontProductCardViewed({
      requestId,
      supplierId,
      tier,
      productTitle: product.title,
      index,
    });

    const display = resolveStorefrontDisplayImage({
      slot: "product",
      label: product.brand?.trim() || product.title,
      imageUrl: product.imageUrl,
    });

    if (display.mode !== "image") {
      trackStorefrontImageFallback({
        requestId,
        supplierId,
        tier,
        imageMode: display.mode,
        imageSource: product.imageUrl ?? null,
        estimatedSourcePx: null,
      });
    }
  }, [index, product.brand, product.imageUrl, product.title, requestId, supplierId, tier]);

  return (
    <article className="flex flex-col rounded-xl border border-zinc-200 bg-white p-3 shadow-sm transition hover:border-zinc-300 hover:shadow-md sm:p-4">
      <StorefrontProductCardImage
        title={product.title}
        imageUrl={product.imageUrl}
        brand={product.brand}
      />

      <div className="mt-3 flex min-h-0 flex-1 flex-col">
        {product.brand ? (
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">
            {product.brand}
          </p>
        ) : null}
        <h3 className="mt-1 line-clamp-2 text-sm font-semibold text-zinc-900">
          {product.title}
        </h3>

        <p className="mt-2 text-sm font-medium text-zinc-900">
          {product.price ?? fallbackPriceDisplay}
        </p>

        <span
          className={`mt-2 inline-flex w-fit items-center rounded-md border px-2 py-0.5 text-xs font-medium ${confidenceChipClass(productStatusLabel)}`}
        >
          {productStatusLabel}
        </span>

        <div className="mt-auto flex flex-col gap-2 pt-4">
          <Link
            href={detailHref}
            onClick={() =>
              trackStorefrontProductDetailViewed({
                requestId,
                supplierId,
                tier,
                productTitle: product.title,
              })
            }
            className="inline-flex min-h-[44px] items-center justify-center rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm font-medium text-zinc-900 transition hover:border-zinc-300 hover:bg-zinc-100"
          >
            View details
          </Link>
        </div>
      </div>
    </article>
  );
}
