import type { SearchResultType } from "./resultTypes";

function pathnameLower(url: string): string {
  try {
    return new URL(url).pathname.toLowerCase();
  } catch {
    return "";
  }
}

const UTILITY_PATH_MARKERS = [
  "/contact",
  "/careers",
  "/about-us",
  "/about/",
  "/about",
  "/privacy",
  "/terms",
  "/terms-of",
  "/locations/",
  "/location/",
  "/faq",
  "/gallery/",
  "/gallery",
  "/calculator",
  "/login",
  "/signup",
  "/sign-up",
  "/account/",
  "/cart",
  "/checkout",
  "/sitemap",
  "/wp-content/",
  "/wp-admin/",
  "/hubfs/",
  "/request-a-q",
  "/request-a-quote",
  "/get-a-quote",
  "/quote/",
  "/support/",
  "/customer-service",
  "/shipping",
  "/returns",
  "/warranty",
  "/legal/",
  "/cookie",
  "/unsubscribe",
  "/subscribe",
  "/events/",
  "/event/",
  "/team/",
  "/leadership",
  "/investor",
  "/press/",
  "/media/",
  "/resources/blog",
  "/how-to-",
  "/how-to/",
  "/barndominium/how-to",
  "/post/",
  "/posts/",
] as const;

const BROWSE_PATH_MARKERS = [
  "/our-products",
  "/product-category/",
  "/product-categor",
  "/product_collection",
  "/product-collection",
  "/product_collections",
  "/product-collections",
  "/steel-products",
  "/building-materials/",
  "/industrial-coatings",
  "/services/",
  "/solutions/",
  "/materials/",
  "/supplies/",
  "/line-card",
  "/linecard",
] as const;

function isUtilityPath(path: string): boolean {
  return UTILITY_PATH_MARKERS.some((marker) => path.includes(marker));
}

function isBlogLikePath(path: string, raw: string): boolean {
  return (
    path.includes("/news") ||
    path.includes("/news-events") ||
    path.includes("/blog") ||
    path.includes("/blog-news/") ||
    raw.includes("announcement") ||
    raw.includes("price-increase") ||
    raw.includes("trends")
  );
}

function isSlugCategorySegment(segment: string): boolean {
  if (!segment || segment.length < 3) return false;
  if (/^\d+$/.test(segment)) return false;
  const hyphenParts = segment.split("-").filter(Boolean);
  if (hyphenParts.length >= 6) return false;
  return /^[a-z0-9][a-z0-9-–—]*[a-z0-9]$|^[a-z]{3,}$/.test(segment);
}

function isProductDetailSegment(segment: string): boolean {
  if (!segment) return false;
  if (/\d{4,}/.test(segment)) return true;
  if (segment.includes("+")) return true;
  if (segment.length > 24 && segment.includes("-")) return true;
  return false;
}

function isProductsPath(path: string): boolean {
  return /^\/products(\/|$)/.test(path);
}

function isProductPath(path: string): boolean {
  return /^\/product(\/|$)/.test(path);
}

function isCatalogPath(path: string): boolean {
  return path === "/catalog" || path.startsWith("/catalog/");
}

export function classifyUrl(url: string): SearchResultType {
  const raw = String(url || "").toLowerCase();
  const path = pathnameLower(url);
  if (!path) return "UNKNOWN";

  if (
    raw.includes("api.") ||
    raw.includes("/api/") ||
    raw.includes("dar-step-service")
  ) {
    return "UNKNOWN";
  }

  if (isBlogLikePath(path, raw)) {
    return "BLOG_PAGE";
  }

  if (
    path.includes("/contractor-center") ||
    path.includes("/content/") ||
    path.includes("/docs/") ||
    path.includes("/documentation/") ||
    path.includes("/knowledge-base/") ||
    path.includes("/technical/glossary")
  ) {
    return "DOCUMENTATION_PAGE";
  }

  if (path.endsWith(".pdf")) {
    return "PDF_PAGE";
  }

  if (isUtilityPath(path)) {
    return "UNKNOWN";
  }

  if (path === "/" || path === "") {
    return "HOMEPAGE";
  }

  if (
    path.includes("/product/") ||
    isProductsPath(path) ||
    path.includes("/item/") ||
    path.includes("/items/") ||
    path.includes("/sku/") ||
    path.includes("/skus/")
  ) {
    return "PRODUCT_PAGE";
  }
  if (isProductPath(path)) return "PRODUCT_PAGE";
  if (/\/p\/[^/]+/.test(path)) return "PRODUCT_PAGE";
  if (path.includes("/buy/") || path.includes("/detail/")) return "PRODUCT_PAGE";

  if (path.includes("/our-products/")) {
    const segments = path.split("/").filter(Boolean);
    const last = segments[segments.length - 1] ?? "";
    if (isProductDetailSegment(last)) {
      return "PRODUCT_PAGE";
    }
    return "CATEGORY_PAGE";
  }
  if (path.includes("/our-products")) {
    return "CATEGORY_PAGE";
  }

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

  if (
    path.includes("/brand/") ||
    path.includes("/brands/") ||
    path.includes("/manufacturer/") ||
    path.includes("/manufacturers/") ||
    path.includes("/vendor/") ||
    path.includes("/vendors/")
  ) {
    return "BRAND_PAGE";
  }

  if (path.includes("/search")) return "SEARCH_PAGE";
  if (
    path.includes("/category/") ||
    path.includes("/categories/") ||
    path.includes("/c/") ||
    path.includes("/shop/") ||
    path.includes("/browse/") ||
    path.includes("/catalog/") ||
    path.includes("/department/") ||
    isCatalogPath(path) ||
    BROWSE_PATH_MARKERS.some((marker) => path.includes(marker))
  ) {
    return "CATEGORY_PAGE";
  }

  if (segments.some((segment) => segment.endsWith("-products"))) {
    return "CATEGORY_PAGE";
  }

  if (segments.length === 1 && isSlugCategorySegment(segments[0]!)) {
    return "CATEGORY_PAGE";
  }

  if (
    segments.length >= 2 &&
    segments.every((segment) => isSlugCategorySegment(segment))
  ) {
    return "CATEGORY_PAGE";
  }

  return "UNKNOWN";
}
