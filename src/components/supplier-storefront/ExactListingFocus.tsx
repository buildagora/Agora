import StorefrontImage from "./StorefrontImage";
import { resolveStorefrontDisplayImage } from "@/lib/search/storefront/resolveStorefrontDisplayImage";

export default function ExactListingFocus({
  supplierName,
  title,
  imageSrc,
  priceDisplay,
  quantityDisplay,
  productStatusLabel,
  supplierDiscoveryState,
}: {
  supplierName: string;
  title: string;
  imageSrc: string | null;
  priceDisplay: string;
  quantityDisplay: string;
  productStatusLabel: string;
  supplierDiscoveryState: string;
}) {
  const display = resolveStorefrontDisplayImage({
    slot: "product",
    label: title,
    imageUrl: imageSrc,
  });

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white px-5 py-5 shadow-sm sm:px-7 sm:py-6">
      <h2 className="text-base font-semibold text-zinc-900 sm:text-lg">
        Best match for your search
      </h2>
      <p className="mt-1 text-sm text-zinc-500">
        Showing the closest match to your exact request
      </p>

      <div className="mt-5 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-5 sm:flex-row">
          {display.mode === "image" ? (
            <StorefrontImage
              slot="product"
              label={title}
              imageUrl={imageSrc}
              variant="product"
              className="h-44 w-full shrink-0 sm:w-48"
              imageClassName="h-44 w-full rounded-lg bg-zinc-50 object-contain sm:w-48"
            />
          ) : null}
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-zinc-900">{title}</h3>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center rounded-md bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                {productStatusLabel}
              </span>
              <span className="inline-flex items-center rounded-md bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600">
                {supplierDiscoveryState === "AUTOMATED_DISCOVERY"
                  ? "Catalog match"
                  : "Exact search"}
              </span>
            </div>
            <div className="mt-4 grid gap-3 rounded-lg border border-zinc-100 bg-zinc-50/60 p-3 text-sm sm:grid-cols-2">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-400">
                  Price
                </p>
                <p className="mt-0.5 font-semibold text-zinc-900">{priceDisplay}</p>
              </div>
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-400">
                  Quantity
                </p>
                <p className="mt-0.5 font-semibold text-zinc-900">{quantityDisplay}</p>
              </div>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-zinc-500">
              {supplierDiscoveryState === "AUTOMATED_DISCOVERY"
                ? "Agora found this listing automatically. Store availability may vary."
                : `We're checking this exact item with ${supplierName}. Pricing and availability update here once verified.`}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
