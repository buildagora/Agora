import { searchSupplierSite } from "./searchSupplierSite";

export async function searchLansing(query: string) {
  return searchSupplierSite({
    query,
    domain: "lansingbp.com",
    supplierIds: ["lansing_hsv"],
    source: "LANSING",
    logLabel: "Lansing Building Products",
    extractImagesFromPage: true,
  });
}
