import type { SearchResultType } from "./resultTypes";

function pathnameLower(url: string): string {
  try {
    return new URL(url).pathname.toLowerCase();
  } catch {
    return "";
  }
}

export function classifyUrl(url: string): SearchResultType {
  const raw = String(url || "").toLowerCase();
  const path = pathnameLower(url);
  if (!path) return "UNKNOWN";

  // Keep existing exclusion heuristics centralized.
  if (
    raw.includes("api.") ||
    raw.includes("/api/") ||
    raw.includes("dar-step-service")
  ) {
    return "UNKNOWN";
  }

  if (
    path.includes("/news") ||
    path.includes("/news-events") ||
    path.includes("/blog") ||
    raw.includes("announcement") ||
    raw.includes("price-increase") ||
    raw.includes("trends")
  ) {
    return "BLOG_PAGE";
  }

  if (
    path.includes("/contractor-center") ||
    path.includes("/content/") ||
    path.includes("/docs/") ||
    path.includes("/documentation/") ||
    path.includes("/knowledge-base/")
  ) {
    return "DOCUMENTATION_PAGE";
  }

  if (path.endsWith(".pdf")) {
    return "PDF_PAGE";
  }

  if (path === "/" || path === "") {
    return "HOMEPAGE";
  }

  // Product-detail style paths.
  if (
    path.includes("/product/") ||
    path.includes("/products/") ||
    path.includes("/item/") ||
    path.includes("/items/") ||
    path.includes("/sku/") ||
    path.includes("/skus/")
  ) {
    return "PRODUCT_PAGE";
  }
  if (/\/p\/[^/]+/.test(path)) return "PRODUCT_PAGE";
  if (path.includes("/buy/") || path.includes("/detail/")) return "PRODUCT_PAGE";

  const segments = path.split("/").filter(Boolean);
  const last = segments[segments.length - 1] ?? "";
  if (
    last.includes("-") &&
    last.length > 12 &&
    /[a-z]/.test(last) &&
    /\d/.test(last)
  ) {
    return "PRODUCT_PAGE";
  }
  if (/\d{6,}/.test(path)) return "PRODUCT_PAGE";

  // Search/category/browse style paths.
  if (path.includes("/search")) return "SEARCH_PAGE";
  if (
    path.includes("/category/") ||
    path.includes("/categories/") ||
    path.includes("/c/") ||
    path.includes("/shop/") ||
    path.includes("/browse/") ||
    path.includes("/catalog/") ||
    path.includes("/department/")
  ) {
    return "CATEGORY_PAGE";
  }

  return "UNKNOWN";
}

