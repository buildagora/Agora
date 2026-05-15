import { searchSupplierSite } from "./searchSupplierSite";

export async function searchGulfeagle(query: string) {
  return searchSupplierSite({
    query,
    domain: "gulfeaglesupply.com",
    supplierIds: ["gulfeagle_hsv"],
    source: "GULFEAGLE",
    logLabel: "Gulfeagle Supply",
    extractImagesFromPage: true,
  });
}
