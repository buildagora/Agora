import type { StorefrontNavItem, SupplierStorefrontView } from "./types";
import type { StorefrontUrlParams } from "./storefrontNavigation";
import type { SupplierProductResult } from "@/lib/suppliers/types";

export type StorefrontBrowseItemKind = "brand" | "category" | "product_line";

export type StorefrontBrowseItem = {
  id: string;
  kind: StorefrontBrowseItemKind;
  label: string;
  sublabel?: string | null;
  actionHref: string | null;
  actionExternal?: boolean;
  actionLabel: string;
  imageSlot: "brand" | "category";
  composeBrand?: string | null;
  composeCategory?: string | null;
  navItem?: StorefrontNavItem;
  profile?: SupplierProductResult;
};

function labelKey(value: string): string {
  return value.trim().toLowerCase();
}

function matchesFilter(label: string, filter: string): boolean {
  const key = labelKey(filter);
  const target = labelKey(label);
  return target.includes(key) || key.includes(target);
}

function brandItems(brands: StorefrontNavItem[]): StorefrontBrowseItem[] {
  return brands.map((b) => ({
    id: `brand-${b.id}`,
    kind: "brand" as const,
    label: b.label,
    sublabel: b.count != null ? `${b.count} in catalog` : "Brand",
    actionHref: null,
    actionLabel: "Filter by brand",
    imageSlot: "brand" as const,
    navItem: b,
  }));
}

function categoryItems(categories: StorefrontNavItem[]): StorefrontBrowseItem[] {
  return categories.map((c) => ({
    id: `category-${c.id}`,
    kind: "category" as const,
    label: c.label,
    sublabel: c.count != null ? `${c.count} in catalog` : "Category",
    actionHref: null,
    actionLabel: "Filter by category",
    imageSlot: "category" as const,
    navItem: c,
  }));
}

function profileItems(
  profiles: SupplierProductResult[],
  brandFilter?: string | null,
  categoryFilter?: string | null
): StorefrontBrowseItem[] {
  return profiles
    .filter((p) => {
      if (brandFilter?.trim()) {
        return p.brand ? matchesFilter(p.brand, brandFilter) : matchesFilter(p.title, brandFilter);
      }
      if (categoryFilter?.trim()) {
        return matchesFilter(p.title, categoryFilter);
      }
      return true;
    })
    .map((p, i) => {
      const evidenceUrl = p.productUrl?.trim() || null;
      return {
        id: `line-${p.title}-${i}`,
        kind: "product_line" as const,
        label: p.title,
        sublabel: p.brand ?? null,
        actionHref: evidenceUrl,
        actionExternal: Boolean(evidenceUrl),
        actionLabel: evidenceUrl ? "View evidence" : "Product line",
        imageSlot: "brand" as const,
        composeBrand: p.brand ?? null,
        composeCategory: p.title,
        profile: p,
      };
    });
}

/**
 * Build navigable browse tiles for capability / empty-catalog storefronts.
 * Respects active brand/category URL filters from sidebar clicks.
 */
export function buildCapabilityBrowseItems(
  view: Pick<SupplierStorefrontView, "sections">,
  urlParams: StorefrontUrlParams
): StorefrontBrowseItem[] {
  const { brands, categories, capabilityProfiles } = view.sections;
  const brandFilter = urlParams.brand?.trim() || null;
  const categoryFilter = urlParams.category?.trim() || null;

  if (brandFilter) {
    const lines = profileItems(capabilityProfiles, brandFilter, null);
    if (lines.length > 0) return lines.slice(0, 24);
    const matchedBrands = brands.filter((b) => matchesFilter(b.label, brandFilter));
    return [
      ...brandItems(matchedBrands),
      ...categoryItems(categories).slice(0, 8),
    ].slice(0, 24);
  }

  if (categoryFilter) {
    const lines = profileItems(capabilityProfiles, null, categoryFilter);
    if (lines.length > 0) return lines.slice(0, 24);
    const matchedCats = categories.filter((c) => matchesFilter(c.label, categoryFilter));
    return [
      ...categoryItems(matchedCats),
      ...brandItems(brands).slice(0, 8),
    ].slice(0, 24);
  }

  if (capabilityProfiles.length > 0) {
    return profileItems(capabilityProfiles).slice(0, 24);
  }

  const brandsOut = brandItems(brands).slice(0, 12);
  const catsOut = categoryItems(categories).slice(0, 12);
  return [...brandsOut, ...catsOut].slice(0, 24);
}
