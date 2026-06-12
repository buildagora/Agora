import { searchSupplierDiscoveryForPrefix } from "./resolveSupplierDiscovery";

export async function searchJohnstone(query: string) {
  return searchSupplierDiscoveryForPrefix("johnstone", query, ["johnstone_hsv"]);
}
