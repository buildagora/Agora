import { searchSupplierSite } from "./searchSupplierSite";

export async function searchBaker(query: string) {
  return searchSupplierSite({
    query,
    domain: "bakerdist.com",
    supplierIds: ["baker_hsv"],
    source: "BAKER",
    logLabel: "Baker Distributing",
  });
}
