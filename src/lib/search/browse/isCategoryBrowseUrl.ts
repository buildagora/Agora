function pathnameLower(url: string): string {
  try {
    return new URL(url).pathname.toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

/** Reject generic supplier catalog roots with no category slug. */
export function isGenericCatalogRoot(url: string): boolean {
  const path = pathnameLower(url).replace(/\/+$/, "");
  return path === "/products" || path === "/catalog" || path === "/shop";
}

/**
 * Supplier category browse pages under /products/ or /catalog/ without SKU-like segments.
 */
export function isCategoryBrowseUrl(url: string): boolean {
  const path = pathnameLower(url);
  if (isGenericCatalogRoot(url)) return false;

  const isBrowsePath =
    path.includes("/products/") ||
    path.includes("/catalog/") ||
    path.includes("/webservices/catalog/");

  if (!isBrowsePath) return false;
  if (/\d{5,}/.test(path)) return false;

  const segments = path.split("/").filter(Boolean);
  const last = segments[segments.length - 1] ?? "";
  if (
    last.length > 12 &&
    last.includes("-") &&
    /[a-z]/.test(last) &&
    /\d/.test(last)
  ) {
    return false;
  }

  return true;
}
