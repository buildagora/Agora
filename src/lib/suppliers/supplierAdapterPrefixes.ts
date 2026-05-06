/**
 * Prefixes matched against supplier ids for automated SerpAPI adapters.
 * Must match keys of `supplierSearchRegistry` in `./registry.ts`.
 */
export const SUPPLIER_ADAPTER_PREFIXES = [
  "home_depot",
  "lowes",
  "abc_supply",
  "ferguson",
  "grainger",
  "cmn90dbjr000404ldzhcsquav",
  "srs",
  "gulfeagle",
  "lansing",
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
