import { isCapabilityProfileResult } from "@/lib/suppliers/capability/profileResultContract";
import type { SupplierSiteSearchStructured } from "@/lib/suppliers/searchSupplierSiteTypes";
import type { SupplierProductResult } from "@/lib/suppliers/types";
import type { SupplierCapabilityAggregate } from "./capabilityAggregateTypes";
import type {
  StorefrontDataProvenance,
  StorefrontNavItem,
  StorefrontNavKind,
  StorefrontSections,
} from "./types";

function normalizeLabel(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function navItem(
  id: string,
  label: string,
  kind: StorefrontNavKind,
  href: string | null,
  source: StorefrontDataProvenance,
  imageUrl?: string | null
): StorefrontNavItem {
  return { id, label, kind, href, source, imageUrl: imageUrl ?? null };
}

function seenLabelKey(label: string): string {
  return normalizeLabel(label).toLowerCase();
}

function mergeNavItems(
  primary: StorefrontNavItem[],
  secondary: StorefrontNavItem[]
): StorefrontNavItem[] {
  const seen = new Set(primary.map((item) => seenLabelKey(item.label)));
  const out = [...primary];
  for (const item of secondary) {
    const key = seenLabelKey(item.label);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function isSafeSerpBrandImage(row: SupplierProductResult): boolean {
  return row.classification === "BRAND_PAGE" && Boolean(row.imageUrl?.trim());
}

function isSafeSerpCategoryImage(row: SupplierProductResult): boolean {
  return (
    (row.classification === "CATEGORY_PAGE" ||
      row.classification === "SEARCH_PAGE") &&
    Boolean(row.imageUrl?.trim())
  );
}

/** Never copy PRODUCT_PAGE thumbnails onto brand/category cards. */
function buildSerpImageByLabel(
  rows: SupplierProductResult[],
  isSafe: (row: SupplierProductResult) => boolean
): Map<string, string> {
  const imageByLabel = new Map<string, string>();
  for (const row of rows) {
    if (!isSafe(row)) continue;
    const key = seenLabelKey(row.title);
    if (!imageByLabel.has(key)) {
      imageByLabel.set(key, row.imageUrl!.trim());
    }
  }
  return imageByLabel;
}

export function enrichNavItemsWithSerpImages(
  items: StorefrontNavItem[],
  serpRows: SupplierProductResult[],
  slot: "brand" | "category"
): StorefrontNavItem[] {
  const imageByLabel = buildSerpImageByLabel(
    serpRows,
    slot === "brand" ? isSafeSerpBrandImage : isSafeSerpCategoryImage
  );

  return items.map((item) => {
    if (item.imageUrl) return item;
    const recovered = imageByLabel.get(seenLabelKey(item.label));
    if (!recovered) return item;
    return { ...item, imageUrl: recovered };
  });
}

function capabilityBrands(aggregate: SupplierCapabilityAggregate): StorefrontNavItem[] {
  return aggregate.brands.map((b) =>
    navItem(b.id, b.label, "brand", b.href, "CAPABILITY")
  );
}

function capabilitySubcategories(aggregate: SupplierCapabilityAggregate): StorefrontNavItem[] {
  return aggregate.subcategories.map((s) =>
    navItem(s.id, s.label, "category", s.href, "CAPABILITY")
  );
}

function serpRowsToNav(
  rows: SupplierProductResult[],
  kind: StorefrontNavKind
): StorefrontNavItem[] {
  return rows.map((row) =>
    navItem(
      `${kind}-${row.productUrl ?? row.title}`,
      row.title,
      kind,
      row.productUrl ?? null,
      "SERP",
      row.imageUrl ?? null
    )
  );
}

/**
 * True when a Serp row belongs in the storefront product grid.
 * Category, brand, and browse pages are excluded even if mis-bucketed upstream.
 */
export function isStorefrontProduct(row: SupplierProductResult): boolean {
  if (isCapabilityProfileResult(row)) {
    return false;
  }
  const classification = row.classification;
  if (classification === "PRODUCT_PAGE" || classification === "PDF_PAGE") {
    return true;
  }
  if (classification) {
    return false;
  }
  // Home Depot / Lowe's engine rows omit classification but are always SKUs.
  return row.source === "HOME_DEPOT" || row.source === "LOWES";
}

export function resolveStorefrontProducts(
  siteSearch: SupplierSiteSearchStructured | null,
  supplierId: string
): SupplierProductResult[] {
  if (!siteSearch) return [];

  const scoped = (rows: SupplierProductResult[]) =>
    rows.filter((row) => row.supplierId === supplierId);

  const fromProducts = scoped(siteSearch.products).filter(isStorefrontProduct);
  if (fromProducts.length > 0) return fromProducts;

  return scoped(siteSearch.flat).filter(isStorefrontProduct);
}

export function mapStorefrontSections(
  supplierId: string,
  capabilityAggregate: SupplierCapabilityAggregate | null,
  siteSearch: SupplierSiteSearchStructured | null
): StorefrontSections {
  const cap = capabilityAggregate;
  const capBrands = cap ? capabilityBrands(cap) : [];
  const capCategories = cap ? capabilitySubcategories(cap) : [];

  const serpBrandRows = siteSearch
    ? siteSearch.brands.filter((r) => r.supplierId === supplierId)
    : [];
  const serpCategoryRows = siteSearch
    ? siteSearch.categories.filter((r) => r.supplierId === supplierId)
    : [];
  const serpBrandNav = serpBrandRows.length
    ? serpRowsToNav(serpBrandRows, "brand")
    : [];
  const serpCategoryNav = serpCategoryRows.length
    ? serpRowsToNav(serpCategoryRows, "category")
    : [];
  const serpOtherNav = siteSearch
    ? serpRowsToNav(
        siteSearch.other.filter((r) => r.supplierId === supplierId),
        "other"
      )
    : [];

  const brands = enrichNavItemsWithSerpImages(
    mergeNavItems(capBrands, serpBrandNav),
    serpBrandRows,
    "brand"
  );
  const categories = enrichNavItemsWithSerpImages(
    mergeNavItems(capCategories, serpCategoryNav),
    serpCategoryRows,
    "category"
  );
  const navigationLinks = [...serpCategoryNav, ...serpBrandNav, ...serpOtherNav];

  return {
    brands,
    categories,
    categoryTree: [],
    navigationLinks,
    facetGroups: [],
    extractedAttributes: [],
    products: resolveStorefrontProducts(siteSearch, supplierId).filter(
      (row) => !isCapabilityProfileResult(row)
    ),
    capabilityProfiles: [],
  };
}

export function resolveStorefrontProvenance(
  capabilityAggregate: SupplierCapabilityAggregate | null,
  siteSearch: SupplierSiteSearchStructured | null,
  sections: StorefrontSections
): StorefrontDataProvenance {
  const hasCapability =
    Boolean(capabilityAggregate) &&
    (capabilityAggregate!.brands.length > 0 ||
      capabilityAggregate!.subcategories.length > 0 ||
      capabilityAggregate!.categories.length > 0);

  const hasSerp =
    Boolean(siteSearch) &&
    (siteSearch!.flat.length > 0 ||
      siteSearch!.products.length > 0 ||
      siteSearch!.categories.length > 0 ||
      siteSearch!.brands.length > 0 ||
      siteSearch!.other.length > 0);

  const hasSectionData =
    sections.brands.length > 0 ||
    sections.categories.length > 0 ||
    sections.navigationLinks.length > 0 ||
    sections.products.length > 0 ||
    sections.capabilityProfiles.length > 0;

  if (!hasCapability && !hasSerp && !hasSectionData) return "NONE";
  if (hasCapability && hasSerp) return "MIXED";
  if (hasCapability) return "CAPABILITY";
  if (hasSerp) return "SERP";
  return "NONE";
}
