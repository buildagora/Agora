import type { StorefrontNavItem } from "./types";

function labelKey(label: string): string {
  return label.trim().toLowerCase();
}

/**
 * Serp navigation rows that duplicate capability brand/category labels
 * are omitted from the dedicated navigation section (they remain in brands/categories).
 */
export function filterStorefrontNavigationLinks(
  navigationLinks: StorefrontNavItem[],
  brands: StorefrontNavItem[],
  categories: StorefrontNavItem[]
): StorefrontNavItem[] {
  const seen = new Set<string>();
  for (const item of [...brands, ...categories]) {
    seen.add(labelKey(item.label));
  }

  return navigationLinks.filter((link) => !seen.has(labelKey(link.label)));
}
