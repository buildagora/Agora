const TRUTHY = new Set(["1", "true", "yes", "on"]);

/**
 * Feature flag for supplier detail storefront (default off).
 * Set SUPPLIER_STOREFRONT_ENABLED=1 to enable once UI is wired (later PRs).
 */
export function isSupplierStorefrontEnabled(): boolean {
  const raw = process.env.SUPPLIER_STOREFRONT_ENABLED;
  if (raw == null || raw === "") {
    return false;
  }
  return TRUTHY.has(raw.trim().toLowerCase());
}
