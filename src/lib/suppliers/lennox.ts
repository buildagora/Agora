import { searchSupplierSite } from "./searchSupplierSite";

export async function searchLennox(query: string) {
  return searchSupplierSite({
    query,
    domain: "lennoxpros.com",
    supplierIds: ["lennox_hsv"],
    source: "LENNOX",
    logLabel: "Lennox",
  });
}
