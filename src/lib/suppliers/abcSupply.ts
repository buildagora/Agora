import { searchSupplierSite } from "./searchSupplierSite";

export async function searchAbcSupply(query: string) {
  return searchSupplierSite({
    query,
    domain: "abcsupply.com",
    supplierIds: ["abc_supply_hsv"],
    source: "ABC_SUPPLY",
    logLabel: "ABC Supply",
    extractImagesFromPage: true,
  });
}
