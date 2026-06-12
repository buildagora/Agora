/** Shared pagination options for supplier catalog adapters. */
export type SupplierCatalogPageOptions = {
  page?: number;
  pageSize?: number;
};

export type SupplierCatalogPageResult = {
  products: import("./types").SupplierProductResult[];
  totalCount: number | null;
  hasMore: boolean;
};
