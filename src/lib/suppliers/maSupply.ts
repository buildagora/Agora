import { searchSupplierSite } from "./searchSupplierSite";

export async function searchMaSupply(query: string) {
  return searchSupplierSite({
    query,
    domain: "masupply.com",
    supplierIds: ["ma_supply_hsv"],
    source: "MA_SUPPLY",
    logLabel: "M&A Supply",
  });
}
