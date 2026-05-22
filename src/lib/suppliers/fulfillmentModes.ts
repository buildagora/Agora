/**
 * Supplier procurement/fulfillment modes for routing UX and checkout behavior.
 * Not persisted in the database yet — prefix-based until supplier records carry mode.
 */

export type SupplierFulfillmentMode =
  | "ECOMMERCE"
  | "HYBRID"
  | "REP_ASSISTED"
  | "MANUAL";

const ECOMMERCE_PREFIXES = ["home_depot", "lowes"] as const;

const HYBRID_PREFIXES = ["grainger", "ferguson"] as const;

const REP_ASSISTED_PREFIXES = [
  "abc_supply",
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

function matchesAnyPrefix(
  supplierId: string,
  prefixes: readonly string[],
): boolean {
  return prefixes.some((prefix) => supplierId.startsWith(prefix));
}

export function getSupplierFulfillmentMode(
  supplierId: string,
): SupplierFulfillmentMode {
  if (matchesAnyPrefix(supplierId, ECOMMERCE_PREFIXES)) return "ECOMMERCE";
  if (matchesAnyPrefix(supplierId, HYBRID_PREFIXES)) return "HYBRID";
  if (matchesAnyPrefix(supplierId, REP_ASSISTED_PREFIXES)) return "REP_ASSISTED";
  return "MANUAL";
}

export function isEcommerceSupplier(supplierId: string): boolean {
  return getSupplierFulfillmentMode(supplierId) === "ECOMMERCE";
}

export function isRepAssistedSupplier(supplierId: string): boolean {
  return getSupplierFulfillmentMode(supplierId) === "REP_ASSISTED";
}

export function isHybridSupplier(supplierId: string): boolean {
  return getSupplierFulfillmentMode(supplierId) === "HYBRID";
}

/** Display label for retailers that support direct storefront navigation. */
export function getSupplierRetailerLabel(supplierId: string): string | null {
  if (supplierId.startsWith("home_depot")) return "Home Depot";
  if (supplierId.startsWith("lowes")) return "Lowe's";
  if (supplierId.startsWith("grainger")) return "Grainger";
  if (supplierId.startsWith("ferguson")) return "Ferguson";
  return null;
}
