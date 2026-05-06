import { searchSupplierSite } from "./searchSupplierSite";

export async function searchTrane(query: string) {
  return searchSupplierSite({
    query,
    domain: "trane.com",
    supplierIds: ["trane_supply_hsv"],
    source: "TRANE",
    logLabel: "Trane Supply",
  });
}
