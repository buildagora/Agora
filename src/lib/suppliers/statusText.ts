export const SUPPLIER_STATUS_TEXT = {
  inStock: "In stock",
  carriesThis: "Carries this",
  likelyCarries: "Likely carries",
  checkingAvailability: "Checking availability",
  outOfStock: "Out of stock",
  catalogMatch: "Catalog match",
  supplierCatalog: "Supplier catalog",
  categoryListing: "Category listing",
  supplierCarriesThisItem: "Supplier carries this item",
} as const;

export function isVerifiedInStock(
  status: string | null | undefined,
  availabilityStatus: string | null | undefined,
): boolean {
  return status === "REPLIED" || availabilityStatus === "IN_STOCK";
}

export function isVerifiedOutOfStock(
  status: string | null | undefined,
  availabilityStatus: string | null | undefined,
): boolean {
  return status === "OUT_OF_STOCK" || availabilityStatus === "OUT_OF_STOCK";
}
