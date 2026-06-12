import { searchSupplierDiscoveryForPrefix } from "./resolveSupplierDiscovery";

export async function searchEcmd(query: string) {
  return searchSupplierDiscoveryForPrefix("ecmd", query, ["ecmd_hsv"]);
}
