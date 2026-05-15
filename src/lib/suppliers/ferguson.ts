import { searchSupplierSite } from "./searchSupplierSite";

export async function searchFerguson(query: string) {
  return searchSupplierSite({
    query,
    domain: "ferguson.com",
    supplierIds: ["ferguson_hvac_hsv", "ferguson_plumbing_hsv"],
    source: "FERGUSON",
    logLabel: "Ferguson",
  });
}
