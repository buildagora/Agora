import type { StorefrontNavKind } from "./types";

/** Structured filter state preserved in supplier detail URLs. */
export type StorefrontUrlParams = {
  brand?: string | null;
  category?: string | null;
  listingTitle?: string | null;
  listingImage?: string | null;
  listingPrice?: string | null;
  listingUrl?: string | null;
  fromThread?: string | null;
  fromSearch?: string | null;
};

export type StorefrontUrlSearchParams = {
  brand?: string;
  category?: string;
  listingTitle?: string;
  listingImage?: string;
  listingPrice?: string;
  listingUrl?: string;
  fromThread?: string;
  fromSearch?: string;
};

function trimParam(value: string | undefined | null): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t.length > 0 ? t : null;
}

export function parseStorefrontUrlParams(
  sp: StorefrontUrlSearchParams | undefined
): StorefrontUrlParams {
  if (!sp) return {};
  return {
    brand: trimParam(sp.brand),
    category: trimParam(sp.category),
    listingTitle: trimParam(sp.listingTitle),
    listingImage: trimParam(sp.listingImage),
    listingPrice: trimParam(sp.listingPrice),
    listingUrl: trimParam(sp.listingUrl),
    fromThread: trimParam(sp.fromThread),
    fromSearch: trimParam(sp.fromSearch),
  };
}

/**
 * Composes the Serp / capability search string from structured URL filters.
 * `brand` and `category` are first-class; request text provides base context.
 */
export function composeStorefrontQuery(input: {
  requestText: string;
  brand?: string | null;
  category?: string | null;
  listingTitle?: string | null;
}): string {
  if (input.listingTitle?.trim()) {
    return input.listingTitle.trim();
  }

  const brand = input.brand?.trim() ?? "";
  const category = input.category?.trim() ?? "";
  const base = input.requestText.trim();

  const filterParts = [brand, category].filter(Boolean);
  if (filterParts.length === 0) {
    return base;
  }

  if (!base) {
    return filterParts.join(" ");
  }

  const baseLower = base.toLowerCase();
  const uniqueFilters = filterParts.filter(
    (part) => !baseLower.includes(part.toLowerCase())
  );

  if (uniqueFilters.length === 0) {
    return base;
  }

  return `${uniqueFilters.join(" ")} ${base}`.trim();
}

export function storefrontFilterLabel(params: StorefrontUrlParams): string | null {
  const parts = [params.brand, params.category].filter(
    (p): p is string => typeof p === "string" && p.length > 0
  );
  return parts.length > 0 ? parts.join(" · ") : null;
}

export function hasActiveStorefrontFilters(params: StorefrontUrlParams): boolean {
  return Boolean(params.brand || params.category);
}

type StorefrontHrefPatch = Partial<StorefrontUrlParams> & {
  clearBrand?: boolean;
  clearCategory?: boolean;
  clearListing?: boolean;
  clearFilters?: boolean;
};

function mergeStorefrontParams(
  current: StorefrontUrlParams,
  patch: StorefrontHrefPatch
): StorefrontUrlParams {
  if (patch.clearFilters) {
    return {
      fromThread: current.fromThread,
      fromSearch: current.fromSearch,
    };
  }

  const brand = patch.clearBrand
    ? null
    : patch.brand !== undefined
      ? patch.brand
      : current.brand;
  const category = patch.clearCategory
    ? null
    : patch.category !== undefined
      ? patch.category
      : current.category;

  const listingCleared = patch.clearListing === true;

  return {
    brand: brand ?? null,
    category: category ?? null,
    listingTitle: listingCleared
      ? null
      : patch.listingTitle !== undefined
        ? patch.listingTitle
        : current.listingTitle,
    listingImage: listingCleared
      ? null
      : patch.listingImage !== undefined
        ? patch.listingImage
        : current.listingImage,
    listingPrice: listingCleared
      ? null
      : patch.listingPrice !== undefined
        ? patch.listingPrice
        : current.listingPrice,
    listingUrl: listingCleared
      ? null
      : patch.listingUrl !== undefined
        ? patch.listingUrl
        : current.listingUrl,
    fromThread: patch.fromThread ?? current.fromThread,
    fromSearch: patch.fromSearch ?? current.fromSearch,
  };
}

export function appendStorefrontParams(
  params: URLSearchParams,
  state: StorefrontUrlParams
): void {
  if (state.brand) params.set("brand", state.brand);
  if (state.category) params.set("category", state.category);
  if (state.listingTitle) params.set("listingTitle", state.listingTitle);
  if (state.listingImage) params.set("listingImage", state.listingImage);
  if (state.listingPrice) params.set("listingPrice", state.listingPrice);
  if (state.listingUrl) params.set("listingUrl", state.listingUrl);
  if (state.fromThread) params.set("fromThread", state.fromThread);
  if (state.fromSearch) params.set("fromSearch", state.fromSearch);
}

export function buildStorefrontHref(
  requestId: string,
  supplierId: string,
  patch: StorefrontHrefPatch,
  current: StorefrontUrlParams = {}
): string {
  const merged = mergeStorefrontParams(current, patch);
  const params = new URLSearchParams();
  appendStorefrontParams(params, merged);
  const qs = params.toString();
  return `/request/${requestId}/supplier/${supplierId}${qs ? `?${qs}` : ""}`;
}

export function buildNavItemRefinementHref(
  requestId: string,
  supplierId: string,
  item: { label: string; kind: StorefrontNavKind },
  current: StorefrontUrlParams
): string {
  const patch: StorefrontHrefPatch = { clearListing: true };

  if (item.kind === "brand") {
    patch.brand = item.label;
  } else {
    patch.category = item.label;
  }

  return buildStorefrontHref(requestId, supplierId, patch, current);
}

export function buildListingDrillHref(
  requestId: string,
  supplierId: string,
  opt: {
    title: string;
    imageUrl?: string | null;
    price?: string | null;
    productUrl?: string | null;
  },
  current: StorefrontUrlParams = {}
): string {
  return buildStorefrontHref(
    requestId,
    supplierId,
    {
      listingTitle: opt.title,
      listingImage: opt.imageUrl ?? null,
      listingPrice: opt.price ?? null,
      listingUrl: opt.productUrl ?? null,
    },
    current
  );
}
