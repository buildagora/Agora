import { lookupBrandLogo } from "./brandLogoRegistry";
import { lookupCategoryVisual } from "./categoryVisualRegistry";
import { brandInitials } from "./normalizeStorefrontLabel";

export type StorefrontImageSlot = "brand" | "category" | "product";

export type StorefrontDisplayImageSource =
  | "brand_registry"
  | "category_registry"
  | "serp_recovered"
  | "product_url";

/** Minimum source dimension before we allow display at 240px. */
export const MIN_PRODUCT_SOURCE_PX = 192;
export const PRODUCT_DISPLAY_PX = 240;
export const MAX_PRODUCT_UPSCALE = 1.25;

export type StorefrontDisplayImage =
  | {
      mode: "image";
      src: string;
      source: StorefrontDisplayImageSource;
      estimatedSourcePx?: number | null;
    }
  | {
      mode: "brand_tile";
      label: string;
      initials: string;
    }
  | {
      mode: "category_tile";
      label: string;
      iconSrc?: string;
    }
  | {
      mode: "product_text";
      label: string;
    }
  | {
      mode: "product_placeholder";
      label: string;
      initials: string;
    };

function estimateSourceDimension(url: string): number | null {
  const patterns = [
    /[?&](?:w|width|sw)=(\d+)/i,
    /[?&](?:h|height|hei)=(\d+)/i,
    /_(\d+)x(\d+)(?:[._-]|$)/i,
    /\/(\d+)x(\d+)\//i,
    /\/images\/[^/]+\/(\d+)\//i,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (!match) continue;
    const w = Number.parseInt(match[1] ?? "", 10);
    const h = match[2] ? Number.parseInt(match[2], 10) : w;
    if (Number.isFinite(w) && w > 0) {
      return Math.min(w, Number.isFinite(h) && h > 0 ? h : w);
    }
  }
  return null;
}

export function isLowQualityProductImage(imageUrl: string | null | undefined): boolean {
  if (!imageUrl?.trim()) return true;
  const dim = estimateSourceDimension(imageUrl.trim());
  if (dim == null) return false;
  return dim < MIN_PRODUCT_SOURCE_PX || dim * MAX_PRODUCT_UPSCALE < PRODUCT_DISPLAY_PX;
}

export function resolveStorefrontDisplayImage(input: {
  slot: StorefrontImageSlot;
  label: string;
  imageUrl?: string | null;
}): StorefrontDisplayImage {
  const trimmedUrl =
    typeof input.imageUrl === "string" && input.imageUrl.trim().length > 0
      ? input.imageUrl.trim()
      : null;

  if (input.slot === "brand") {
    const registry = lookupBrandLogo(input.label);
    if (registry) {
      return { mode: "image", src: registry.src, source: "brand_registry" };
    }
    if (trimmedUrl) {
      return { mode: "image", src: trimmedUrl, source: "serp_recovered" };
    }
    return {
      mode: "brand_tile",
      label: input.label,
      initials: brandInitials(input.label),
    };
  }

  if (input.slot === "category") {
    const registry = lookupCategoryVisual(input.label);
    if (registry) {
      return {
        mode: "image",
        src: registry.src,
        source: "category_registry",
      };
    }
    if (trimmedUrl) {
      return { mode: "image", src: trimmedUrl, source: "serp_recovered" };
    }
    return {
      mode: "category_tile",
      label: input.label,
      iconSrc: "/storefront/categories/default.svg",
    };
  }

  if (!trimmedUrl || isLowQualityProductImage(trimmedUrl)) {
    return {
      mode: "product_placeholder",
      label: input.label,
      initials: brandInitials(input.label),
    };
  }

  const estimatedSourcePx = estimateSourceDimension(trimmedUrl);
  return {
    mode: "image",
    src: trimmedUrl,
    source: "product_url",
    estimatedSourcePx,
  };
}
