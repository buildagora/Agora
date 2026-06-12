import { categoryIdToLabel, type CategoryId } from "@/lib/categoryIds";
import type {
  AggregateSupplierCapabilitiesOptions,
  SupplierCapabilityAggregate,
  SupplierCapabilityRow,
  StorefrontCapabilityBrand,
  StorefrontCapabilityCategory,
  StorefrontCapabilitySubcategory,
} from "./capabilityAggregateTypes";

function normalizeLabel(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function slugify(value: string): string {
  return normalizeLabel(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function categoryLabel(categoryId: string): string {
  const id = categoryId.trim() as CategoryId;
  if (id in categoryIdToLabel) {
    return categoryIdToLabel[id];
  }
  return categoryId
    .replace(/_/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function compareLabels(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: "base" });
}

/**
 * Pure aggregation from capability rows. Deduplicates by normalized label;
 * does not emit counts or inferred catalog data.
 */
export function aggregateSupplierCapabilitiesFromRows(
  supplierId: string,
  rows: SupplierCapabilityRow[],
  options: AggregateSupplierCapabilitiesOptions = {}
): SupplierCapabilityAggregate {
  const categoryFilter = options.categoryId?.trim() || null;

  const filtered = rows.filter((row) => {
    if (categoryFilter && row.categoryId.trim() !== categoryFilter) {
      return false;
    }
    return true;
  });

  const brandMap = new Map<
    string,
    { label: string; categoryIds: Set<string>; href: string | null }
  >();
  const categoryMap = new Map<
    string,
    { categoryId: string; label: string; href: string | null }
  >();
  const subcategoryMap = new Map<
    string,
    { label: string; categoryId: string; href: string | null }
  >();

  for (const row of filtered) {
    const catId = row.categoryId.trim();
    const subcategory = normalizeLabel(row.subcategory);
    const brand = normalizeLabel(row.brand);
    const sourceUrl = row.sourceUrl?.trim() || null;

    if (catId) {
      const existingCat = categoryMap.get(catId);
      if (!existingCat) {
        categoryMap.set(catId, {
          categoryId: catId,
          label: categoryLabel(catId),
          href: sourceUrl,
        });
      } else if (!existingCat.href && sourceUrl) {
        existingCat.href = sourceUrl;
      }
    }

    if (subcategory) {
      const subKey = `${catId}::${subcategory.toLowerCase()}`;
      const existingSub = subcategoryMap.get(subKey);
      if (!existingSub) {
        subcategoryMap.set(subKey, {
          label: subcategory,
          categoryId: catId,
          href: sourceUrl,
        });
      } else if (!existingSub.href && sourceUrl) {
        existingSub.href = sourceUrl;
      }
    }

    if (brand) {
      const brandKey = brand.toLowerCase();
      const existingBrand = brandMap.get(brandKey);
      if (!existingBrand) {
        brandMap.set(brandKey, {
          label: brand,
          categoryIds: new Set(catId ? [catId] : []),
          href: sourceUrl,
        });
      } else {
        if (catId) existingBrand.categoryIds.add(catId);
        if (!existingBrand.href && sourceUrl) {
          existingBrand.href = sourceUrl;
        }
      }
    }
  }

  const brands: StorefrontCapabilityBrand[] = [...brandMap.values()]
    .map((b) => ({
      id: slugify(b.label),
      label: b.label,
      categoryIds: [...b.categoryIds].sort(),
      href: b.href,
    }))
    .sort((a, b) => compareLabels(a.label, b.label));

  const categories: StorefrontCapabilityCategory[] = [...categoryMap.values()]
    .map((c) => ({
      id: c.categoryId,
      categoryId: c.categoryId,
      label: c.label,
      href: c.href,
    }))
    .sort((a, b) => compareLabels(a.label, b.label));

  const subcategories: StorefrontCapabilitySubcategory[] = [...subcategoryMap.values()]
    .map((s) => ({
      id: slugify(`${s.categoryId}-${s.label}`),
      label: s.label,
      categoryId: s.categoryId,
      href: s.href,
    }))
    .sort((a, b) => compareLabels(a.label, b.label));

  return {
    supplierId,
    brands,
    categories,
    subcategories,
  };
}
