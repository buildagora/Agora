import type { StorefrontHeader } from "@/lib/search/storefront/types";

export default function SupplierStorefrontHeader({
  header,
  materialRequestText,
}: {
  header: StorefrontHeader;
  /** Original material request text when no listing drill-down is active. */
  materialRequestText?: string | null;
}) {
  return (
    <div className="space-y-1">
      {materialRequestText ? (
        <p className="text-xs leading-relaxed text-zinc-500 sm:text-sm">
          Request: &quot;{materialRequestText}&quot;
        </p>
      ) : null}
      <h1 className="text-2xl font-bold tracking-tight text-zinc-900 sm:text-3xl">
        {header.title}
      </h1>
      <p className="text-sm text-zinc-600 sm:text-base">{header.subtitle}</p>
      <p className="text-sm text-zinc-500">
        <span>{header.categoryLabel}</span>
        {header.locationLabel ? (
          <>
            <span className="mx-1.5 text-zinc-300" aria-hidden>
              ·
            </span>
            <span>{header.locationLabel}</span>
          </>
        ) : null}
      </p>
    </div>
  );
}
