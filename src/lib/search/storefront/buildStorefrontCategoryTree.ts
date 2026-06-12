import type { SupplierProductResult } from "@/lib/suppliers/types";
import type { SupplierCapabilityAggregate } from "./capabilityAggregateTypes";
import type { StorefrontCategoryTreeNode, StorefrontNavItem } from "./types";

function normalizeLabel(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function labelKey(value: string): string {
  return normalizeLabel(value).toLowerCase();
}

function countProductsForLabel(
  products: SupplierProductResult[],
  label: string,
  field: "brand" | "category"
): number {
  const key = labelKey(label);
  return products.filter((p) => {
    if (field === "brand") {
      const raw = p.brand?.trim();
      return raw != null && labelKey(raw) === key;
    }
    return p.title.trim().toLowerCase().includes(key);
  }).length;
}

/**
 * Build a 2-level category tree from capability parent categories + subcategories.
 */
export function buildStorefrontCategoryTree(
  aggregate: SupplierCapabilityAggregate | null,
  products: SupplierProductResult[] = []
): StorefrontCategoryTreeNode[] {
  if (!aggregate) return [];

  const childrenByParent = new Map<
    string,
    { id: string; label: string; href: string | null; count?: number }[]
  >();

  for (const sub of aggregate.subcategories) {
    const parentLabel =
      aggregate.categories.find((c) => c.categoryId === sub.categoryId)?.label ??
      sub.categoryId;
    const parentKey = labelKey(parentLabel);
    const list = childrenByParent.get(parentKey) ?? [];
    const count = countProductsForLabel(products, sub.label, "category");
    list.push({
      id: sub.id,
      label: sub.label,
      href: sub.href,
      count: count > 0 ? count : undefined,
    });
    childrenByParent.set(parentKey, list);
  }

  const nodes: StorefrontCategoryTreeNode[] = [];

  for (const cat of aggregate.categories) {
    const parentKey = labelKey(cat.label);
    const children = (childrenByParent.get(parentKey) ?? []).sort((a, b) =>
      a.label.localeCompare(b.label)
    );
    const parentCount = countProductsForLabel(products, cat.label, "category");
    nodes.push({
      id: cat.id,
      label: cat.label,
      href: cat.href,
      count: parentCount > 0 ? parentCount : undefined,
      children,
    });
  }

  // Subcategories whose parent category row is missing
  for (const [parentKey, children] of childrenByParent) {
    if (nodes.some((n) => labelKey(n.label) === parentKey)) continue;
    const label = children[0]?.label ?? parentKey;
    nodes.push({
      id: `orphan-${parentKey}`,
      label: label.charAt(0).toUpperCase() + label.slice(1),
      href: null,
      children: children.sort((a, b) => a.label.localeCompare(b.label)),
    });
  }

  return nodes.sort((a, b) => a.label.localeCompare(b.label));
}

/** Attach product counts to brand nav items when catalog data is available. */
export function enrichNavItemsWithCounts(
  items: StorefrontNavItem[],
  products: SupplierProductResult[],
  field: "brand" | "category"
): StorefrontNavItem[] {
  if (products.length === 0) return items;
  return items.map((item) => {
    const count = countProductsForLabel(products, item.label, field);
    return count > 0 ? { ...item, count } : item;
  });
}
