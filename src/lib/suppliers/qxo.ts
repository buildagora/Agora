import { searchSupplierDiscoveryForPrefix } from "./resolveSupplierDiscovery";

const QXO_PREFIX = "cmn90dbjr000404ldzhcsquav" as const;
const QXO_SUPPLIER_IDS = ["cmn90dbjr000404ldzhcsquav"] as const;

export async function searchQxo(query: string) {
  return searchSupplierDiscoveryForPrefix(QXO_PREFIX, query, [...QXO_SUPPLIER_IDS]);
}
