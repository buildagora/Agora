import { searchSupplierSite } from "./searchSupplierSite";

export async function searchMingledorffs(query: string) {
  return searchSupplierSite({
    query,
    domain: "mingledorffs.com",
    supplierIds: ["mingledorffs_hsv"],
    source: "MINGLEDORFFS",
    logLabel: "Mingledorff's",
  });
}
