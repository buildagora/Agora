import { searchSupplierDiscoveryForPrefix } from "./resolveSupplierDiscovery";

export async function searchBaker(query: string) {
  return searchSupplierDiscoveryForPrefix("baker", query, ["baker_hsv"]);
}
