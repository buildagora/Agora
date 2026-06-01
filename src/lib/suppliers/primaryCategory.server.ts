import "server-only";

import { categoryIdToLabel, type CategoryId } from "@/lib/categoryIds";
import {
  normalizeToCanonicalCategoryId,
  pickPrimaryCategoryId,
} from "@/lib/suppliers/categoryTaxonomy";

export type SupplierPrimaryCategorySource = {
  id: string;
  category?: string | null;
  primaryCategoryId?: string | null;
  categoryLinks?: { categoryId: string }[];
};

/**
 * Resolve canonical primary category for a supplier row.
 * Prefers persisted primaryCategoryId when set and valid.
 */
export function resolveSupplierPrimaryCategoryId(
  supplier: SupplierPrimaryCategorySource
): CategoryId {
  const persisted = normalizeToCanonicalCategoryId(
    supplier.primaryCategoryId ?? null
  );
  if (persisted) return persisted;

  return pickPrimaryCategoryId({
    supplierId: supplier.id,
    linkCategoryIds:
      supplier.categoryLinks?.map((l) => l.categoryId) ?? [],
    legacyCategory: supplier.category ?? null,
  });
}

export function primaryCategoryLabel(supplier: SupplierPrimaryCategorySource): string {
  const id = resolveSupplierPrimaryCategoryId(supplier);
  return categoryIdToLabel[id];
}

/** Prisma select fragment for routes that need primary category resolution. */
export const supplierPrimaryCategorySelect = {
  id: true,
  category: true,
  primaryCategoryId: true,
  categoryLinks: { select: { categoryId: true } },
} as const;
