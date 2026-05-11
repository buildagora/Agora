import { searchSupplierSite } from "./searchSupplierSite";

export async function searchSrs(query: string) {
  return searchSupplierSite({
    query,
    domain: "srsdistribution.com",
    supplierIds: ["srs_hsv"],
    source: "SRS",
    logLabel: "SRS Building Products",
    extractImagesFromPage: true,
  });
}
