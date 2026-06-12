import Link from "next/link";
import { resolveStorefrontDisplayImage } from "@/lib/search/storefront/resolveStorefrontDisplayImage";
import { buildListingDrillHref } from "@/lib/search/storefront/storefrontNavigation";
import type { StorefrontUrlParams } from "@/lib/search/storefront/storefrontNavigation";
import type { SupplierProductResult } from "@/lib/suppliers/types";
import StorefrontImage from "./StorefrontImage";

export type LegacyProductOption = {
  title: string;
  imageUrl?: string | null;
  price?: string | null;
  productUrl?: string | null;
};

export default function ProductSection({
  supplierId,
  requestId,
  products,
  legacyOptions = [],
  productStatusLabel,
  fallbackPriceDisplay,
  urlParams,
  title = "Matching products",
  description,
}: {
  supplierId: string;
  requestId: string;
  products: SupplierProductResult[];
  legacyOptions?: LegacyProductOption[];
  productStatusLabel: string;
  fallbackPriceDisplay: string;
  urlParams: StorefrontUrlParams;
  title?: string;
  description?: string;
}) {
  const hasProducts = products.length > 0;
  const hasLegacy = legacyOptions.length > 0;
  if (!hasProducts && !hasLegacy) return null;

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white px-5 py-5 shadow-sm sm:px-7 sm:py-6">
      <h2 className="text-base font-semibold text-zinc-900 sm:text-lg">{title}</h2>
      {description ? (
        <p className="mt-1 text-sm text-zinc-500">{description}</p>
      ) : null}

      {hasProducts ? (
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          {products.map((opt, i) => {
            const display = resolveStorefrontDisplayImage({
              slot: "product",
              label: opt.title,
              imageUrl: opt.imageUrl ?? null,
            });
            return (
              <Link
                key={`${opt.title}-${opt.productUrl ?? i}`}
                href={buildListingDrillHref(
                  requestId,
                  supplierId,
                  {
                    title: opt.title,
                    imageUrl: opt.imageUrl ?? null,
                    price: opt.price ?? null,
                    productUrl: opt.productUrl ?? null,
                  },
                  urlParams
                )}
                className="group block rounded-xl border border-zinc-200 bg-white p-4 shadow-sm transition hover:border-zinc-300 hover:shadow-md"
              >
                {display.mode === "image" ? (
                  <StorefrontImage
                    slot="product"
                    label={opt.title}
                    imageUrl={opt.imageUrl}
                    variant="product"
                    className="mb-3 block"
                    imageClassName="h-32 w-full rounded-lg object-contain bg-zinc-50"
                  />
                ) : null}
                <h3 className="line-clamp-2 text-sm font-semibold text-zinc-900">
                  {opt.title}
                </h3>
                {opt.brand ? (
                  <p className="mt-1 text-xs text-zinc-500">{opt.brand}</p>
                ) : null}
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center rounded-md bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                    {productStatusLabel}
                  </span>
                </div>
                <div className="mt-3 text-sm font-medium text-zinc-900">
                  {opt.price ?? fallbackPriceDisplay}
                </div>
                <p className="mt-2 text-xs text-zinc-500">View product details</p>
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          {legacyOptions.map((opt, i) => (
            <Link
              key={`${opt.title}-${i}`}
              href={buildListingDrillHref(
                requestId,
                supplierId,
                {
                  title: opt.title,
                  imageUrl: opt.imageUrl ?? null,
                  price: opt.price ?? null,
                  productUrl: opt.productUrl ?? null,
                },
                urlParams
              )}
              className="group block rounded-xl border border-zinc-200 bg-white p-4 shadow-sm transition hover:border-zinc-300 hover:shadow-md"
            >
              <h3 className="line-clamp-2 text-sm font-semibold text-zinc-900">
                {opt.title}
              </h3>
              <p className="mt-2 text-xs text-zinc-500">View product details</p>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
