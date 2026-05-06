import { searchSupplierSite } from "./searchSupplierSite";

export async function searchEcmd(query: string) {
  return searchSupplierSite({
    query,
    domain: "ecmd.com",
    supplierIds: ["ecmd_hsv"],
    source: "ECMD",
    logLabel: "East Coast Metal Distributors",
  });
}
