import { searchSupplierDiscoveryForPrefix } from "./resolveSupplierDiscovery";

export async function searchMingledorffs(query: string) {
  return searchSupplierDiscoveryForPrefix("mingledorffs", query, ["mingledorffs_hsv"]);
}
