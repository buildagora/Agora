"use client";

import ImageWithFallback from "@/components/ImageWithFallback";
import { brandInitials } from "@/lib/search/storefront/normalizeStorefrontLabel";
import {
  resolveStorefrontDisplayImage,
  type StorefrontImageSlot,
} from "@/lib/search/storefront/resolveStorefrontDisplayImage";
import {
  BrandMonogramFallback,
  CategoryIconFallback,
  ComposedLineFallback,
  ProductImageFallback,
} from "./storefrontImageFallbacks";

export type StorefrontImageVariant = "icon-only" | "full" | "product" | "composed";

function brandFallbackForVariant(label: string, variant: StorefrontImageVariant) {
  const sizeClass =
    variant === "icon-only" ? "h-full w-full text-[9px]" : "h-10 w-10 text-xs";
  return <BrandMonogramFallback label={label} className={sizeClass} />;
}

function categoryFallbackForVariant(label: string, variant: StorefrontImageVariant) {
  const sizeClass = variant === "icon-only" ? "h-full w-full" : "h-10 w-10";
  return <CategoryIconFallback label={label} className={sizeClass} />;
}

export default function StorefrontImage({
  slot,
  label,
  imageUrl,
  variant = "full",
  composeBrand,
  composeCategory,
  className,
  imageClassName,
}: {
  slot: StorefrontImageSlot;
  label: string;
  imageUrl?: string | null;
  variant?: StorefrontImageVariant;
  composeBrand?: string | null;
  composeCategory?: string | null;
  className?: string;
  imageClassName?: string;
}) {
  if (variant === "composed") {
    const brandLabel = composeBrand?.trim() || label;
    const categoryLabel = composeCategory?.trim() || label;
    const brandResolved = resolveStorefrontDisplayImage({
      slot: "brand",
      label: brandLabel,
      imageUrl: null,
    });

    if (brandResolved.mode === "image") {
      return (
        <div className={`relative ${className ?? ""}`}>
          <ImageWithFallback
            src={brandResolved.src}
            alt={brandLabel}
            className={imageClassName ?? "h-full w-full object-contain"}
            fallback={
              <ComposedLineFallback
                brandLabel={brandLabel}
                categoryLabel={categoryLabel}
                className="h-full w-full"
              />
            }
            fallbackContainerClassName="flex h-full w-full items-center justify-center"
          />
          <span className="pointer-events-none absolute bottom-0 right-0 flex h-4 w-4 items-center justify-center overflow-hidden rounded bg-white shadow-sm ring-1 ring-zinc-200">
            <CategoryIconFallback label={categoryLabel} className="h-3 w-3" />
          </span>
        </div>
      );
    }

    return (
      <ComposedLineFallback
        brandLabel={brandLabel}
        categoryLabel={categoryLabel}
        className={className ?? "h-full w-full"}
      />
    );
  }

  if (variant === "product") {
    const resolved = resolveStorefrontDisplayImage({ slot: "product", label, imageUrl });
    if (resolved.mode === "image") {
      return (
        <ImageWithFallback
          src={resolved.src}
          alt={label}
          className={imageClassName ?? className}
          fallback={<ProductImageFallback className={imageClassName ?? className} />}
          fallbackContainerClassName="flex items-center justify-center"
        />
      );
    }
    return <ProductImageFallback className={imageClassName ?? className} />;
  }

  const resolved = resolveStorefrontDisplayImage({ slot, label, imageUrl });

  // Sidebar icons: monograms read better than scaled wordmarks at 20px.
  if (
    variant === "icon-only" &&
    (slot === "brand" || slot === "category") &&
    resolved.mode === "image" &&
    resolved.source === "brand_registry"
  ) {
    return (
      <span
        className={`inline-flex shrink-0 items-center justify-center ${className ?? "h-5 w-5"}`}
        aria-label={label}
        role="img"
      >
        {brandFallbackForVariant(label, "icon-only")}
      </span>
    );
  }

  if (resolved.mode === "image") {
    const fallback =
      slot === "brand"
        ? brandFallbackForVariant(label, variant)
        : slot === "category"
          ? categoryFallbackForVariant(label, variant)
          : null;

    const imgClass =
      variant === "icon-only"
        ? `${imageClassName ?? className ?? ""} object-contain`
        : imageClassName ?? className;

    return (
      <ImageWithFallback
        src={resolved.src}
        alt={label}
        className={imgClass}
        fallback={fallback}
        fallbackContainerClassName={
          variant === "icon-only"
            ? "flex h-full w-full items-center justify-center"
            : "flex items-center justify-center bg-white"
        }
      />
    );
  }

  if (resolved.mode === "brand_tile") {
    if (variant === "icon-only") {
      return (
        <span
          className={`inline-flex shrink-0 items-center justify-center ${className ?? "h-5 w-5"}`}
          aria-label={label}
          role="img"
        >
          {brandFallbackForVariant(resolved.label, "icon-only")}
        </span>
      );
    }
    return (
      <span
        className={`inline-flex items-center justify-center ${className ?? ""}`}
        aria-label={label}
        role="img"
      >
        {brandFallbackForVariant(resolved.label, "full")}
      </span>
    );
  }

  if (resolved.mode === "category_tile") {
    if (variant === "icon-only") {
      return (
        <span
          className={`inline-flex shrink-0 items-center justify-center ${className ?? "h-5 w-5"}`}
          aria-label={label}
          role="img"
        >
          {categoryFallbackForVariant(resolved.label, "icon-only")}
        </span>
      );
    }
    return (
      <span
        className={`inline-flex items-center justify-center ${className ?? ""}`}
        aria-label={label}
        role="img"
      >
        {categoryFallbackForVariant(resolved.label, "full")}
      </span>
    );
  }

  if (resolved.mode === "product_placeholder") {
    return <ProductImageFallback className={imageClassName ?? className} />;
  }

  return null;
}

export { brandInitials };
