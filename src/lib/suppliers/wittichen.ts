import { searchSupplierSite } from "./searchSupplierSite";

export async function searchWittichen(query: string) {
  return searchSupplierSite({
    query,
    domain: "wittichen-supply.com",
    supplierIds: ["wittichen_hsv"],
    source: "WITTICHEN",
    logLabel: "Wittichen Supply",
  });
}
