import { searchSupplierDiscoveryForPrefix } from "./resolveSupplierDiscovery";

export async function searchLennox(query: string) {
  return searchSupplierDiscoveryForPrefix("lennox", query, ["lennox_hsv"]);
}
