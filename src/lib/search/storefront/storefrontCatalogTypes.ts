import type { SupplierProductResult } from "@/lib/suppliers/types";

export type StorefrontCatalogPagination = {
  page: number;
  pageSize: number;
  totalCount: number | null;
  hasMore: boolean;
};

export type StorefrontCatalogPageRequest = {
  supplierId: string;
  productSearchQuery: string;
  page?: number;
  pageSize?: number;
  brandFilter?: string | null;
  categoryFilter?: string | null;
  logLabel?: string;
};

export type StorefrontCatalogPageResult = {
  products: SupplierProductResult[];
  pagination: StorefrontCatalogPagination;
};

export const EMPTY_CATALOG_PAGINATION: StorefrontCatalogPagination = {
  page: 1,
  pageSize: 12,
  totalCount: null,
  hasMore: false,
};
