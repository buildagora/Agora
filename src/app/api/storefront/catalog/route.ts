import { NextRequest, NextResponse } from "next/server";
import { fetchStorefrontCatalogPage } from "@/lib/search/storefront/fetchStorefrontCatalogPage.server";
import { filterProductsByAttributes } from "@/lib/search/storefront/filterProductsByAttributes";
import {
  clampStorefrontPage,
  clampStorefrontPageSize,
  STOREFRONT_INITIAL_PAGE_SIZE,
} from "@/lib/search/storefront/storefrontCatalogConstants";

export const dynamic = "force-dynamic";

const CACHE_CONTROL = "private, max-age=60, stale-while-revalidate=120";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const supplierId = searchParams.get("supplier")?.trim();
  const query = searchParams.get("query")?.trim();
  const page = clampStorefrontPage(Number(searchParams.get("page") ?? 1));
  const pageSize = clampStorefrontPageSize(
    Number(searchParams.get("pageSize") ?? STOREFRONT_INITIAL_PAGE_SIZE)
  );
  const brandFilter = searchParams.get("brand");
  const categoryFilter = searchParams.get("category");

  if (!supplierId || !query) {
    return NextResponse.json(
      { error: "supplier and query are required" },
      { status: 400 }
    );
  }

  const attributeFilters: Record<string, string> = {};
  for (const [key, value] of searchParams.entries()) {
    if (key.startsWith("attr.") && value.trim()) {
      attributeFilters[key.slice(5)] = value.trim();
    }
  }

  const result = await fetchStorefrontCatalogPage({
    supplierId,
    productSearchQuery: query,
    page,
    pageSize,
    brandFilter,
    categoryFilter,
    logLabel: `storefront-catalog:${supplierId}`,
  });

  let products = result.products;
  if (brandFilter?.trim()) {
    const key = brandFilter.trim().toLowerCase();
    products = products.filter(
      (p) => p.brand?.trim().toLowerCase() === key
    );
  }
  if (categoryFilter?.trim()) {
    const key = categoryFilter.trim().toLowerCase();
    products = products.filter((p) =>
      p.title.trim().toLowerCase().includes(key)
    );
  }
  if (Object.keys(attributeFilters).length > 0) {
    products = filterProductsByAttributes(products, attributeFilters);
  }

  return NextResponse.json(
    {
      products,
      totalCount: result.pagination.totalCount,
      hasMore: result.pagination.hasMore,
      page: result.pagination.page,
      pageSize: result.pagination.pageSize,
    },
    { headers: { "Cache-Control": CACHE_CONTROL } }
  );
}
