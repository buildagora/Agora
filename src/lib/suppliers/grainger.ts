import { searchSupplierSite } from "./searchSupplierSite";

export async function searchGrainger(query: string) {
  return searchSupplierSite({
    query,
    domain: "grainger.com",
    supplierIds: ["grainger_hsv"],
    source: "GRAINGER",
    logLabel: "Grainger",
  });
}
