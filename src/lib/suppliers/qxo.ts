import { searchSupplierSite } from "./searchSupplierSite";

export async function searchQxo(query: string) {
  return searchSupplierSite({
    query,
    domain: "beaconbuildingproducts.com",
    supplierIds: ["cmn90dbjr000404ldzhcsquav"],
    source: "QXO",
    logLabel: "QXO",
    extractImagesFromPage: true,
  });
}
