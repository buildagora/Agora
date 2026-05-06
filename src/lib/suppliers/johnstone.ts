import { searchSupplierSite } from "./searchSupplierSite";

export async function searchJohnstone(query: string) {
  return searchSupplierSite({
    query,
    domain: "johnstonesupply.com",
    supplierIds: ["johnstone_hsv"],
    source: "JOHNSTONE",
    logLabel: "Johnstone Supply",
  });
}
