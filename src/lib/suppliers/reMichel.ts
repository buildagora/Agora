import { searchSupplierSite } from "./searchSupplierSite";

export async function searchReMichel(query: string) {
  return searchSupplierSite({
    query,
    domain: "remichel.com",
    supplierIds: ["re_michel_hsv"],
    source: "RE_MICHEL",
    logLabel: "R.E. Michel",
  });
}
