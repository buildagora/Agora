import { searchSupplierSite } from "./searchSupplierSite";

export async function searchShearer(query: string) {
  return searchSupplierSite({
    query,
    domain: "shearersupply.com",
    supplierIds: ["shearer_supply_hsv"],
    source: "SHEARER",
    logLabel: "Shearer Supply",
  });
}
