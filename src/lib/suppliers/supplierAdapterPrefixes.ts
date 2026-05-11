/**
 * Prefixes matched against supplier ids for automated SerpAPI adapters.
 * Must match keys of `supplierSearchRegistry` in `./registry.ts`.
 *
 * Trust policy: Google Shopping–style adapters should only be registered here when the
 * returned listings can be treated as trustworthy marketplace/storefront evidence for that
 * supplier (e.g. national retail chains). Distributor-style suppliers should rely on
 * supplier-domain organic/site-search evidence instead, not generic Shopping results that may
 * show other merchants’ listings.
 */
export const SUPPLIER_ADAPTER_PREFIXES = [
  "home_depot",
  "lowes",
  "abc_supply",
  "ferguson",
  "grainger",
  "baker",
  "johnstone",
  "lennox",
  "ma_supply",
  "mingledorffs",
  "re_michel",
  "shearer",
  "trane",
  "wittichen",
  "ecmd",
] as const;

export type SupplierAdapterPrefix = (typeof SUPPLIER_ADAPTER_PREFIXES)[number];

/** Client-safe: does not import adapter implementations. */
export function isAutomatedSupplierId(supplierId: string): boolean {
  return SUPPLIER_ADAPTER_PREFIXES.some((p) => supplierId.startsWith(p));
}
