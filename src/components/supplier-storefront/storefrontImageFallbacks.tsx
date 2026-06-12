import { brandInitials } from "@/lib/search/storefront/normalizeStorefrontLabel";
import { lookupCategoryVisual } from "@/lib/search/storefront/categoryVisualRegistry";

/** Neutral brand monogram — no label, no black pill. */
export function BrandMonogramFallback({
  label,
  className,
}: {
  label: string;
  className?: string;
}) {
  const initials = brandInitials(label);
  return (
    <span
      className={`inline-flex items-center justify-center rounded-md bg-zinc-100 font-semibold text-zinc-600 ${className ?? "h-5 w-5 text-[9px]"}`}
      aria-hidden
    >
      {initials}
    </span>
  );
}

/** Abstract category icon — icon only, no embedded label. */
export function CategoryIconFallback({
  label,
  className,
}: {
  label: string;
  className?: string;
}) {
  const visual = lookupCategoryVisual(label);
  const src = visual?.src ?? "/storefront/categories/default.svg";
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      className={`object-contain opacity-80 ${className ?? "h-5 w-5"}`}
      aria-hidden
    />
  );
}

/** Product missing-image placeholder — package icon, no initials. */
export function ProductImageFallback({
  className,
}: {
  className?: string;
}) {
  return (
    <div
      className={`flex items-center justify-center rounded-lg border border-zinc-200 bg-zinc-50 ${className ?? "aspect-square w-full"}`}
      aria-hidden
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-10 w-10 text-zinc-400"
      >
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
        <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
        <line x1="12" y1="22.08" x2="12" y2="12" />
      </svg>
    </div>
  );
}

/** Capability product-line: brand visual + category badge. */
export function ComposedLineFallback({
  brandLabel,
  categoryLabel,
  className,
}: {
  brandLabel: string | null | undefined;
  categoryLabel: string;
  className?: string;
}) {
  const brand = brandLabel?.trim() || categoryLabel;
  return (
    <div
      className={`relative flex items-center justify-center rounded-lg border border-zinc-100 bg-zinc-50 ${className ?? "h-full w-full"}`}
      aria-hidden
    >
      <BrandMonogramFallback
        label={brand}
        className="h-10 w-10 text-xs"
      />
      <span className="absolute bottom-0.5 right-0.5 flex h-4 w-4 items-center justify-center overflow-hidden rounded bg-white shadow-sm ring-1 ring-zinc-200">
        <CategoryIconFallback label={categoryLabel} className="h-3 w-3" />
      </span>
    </div>
  );
}
