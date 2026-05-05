import type { SupplierProductResult, SupplierProductSource } from "./types";
import type { SupplierAdapterPrefix } from "./supplierAdapterPrefixes";
import { SUPPLIER_ADAPTER_PREFIXES } from "./supplierAdapterPrefixes";
import { searchAbcSupply } from "./abcSupply";
import { searchFerguson } from "./ferguson";
import { searchGrainger } from "./grainger";
import { searchHomeDepot } from "./homeDepot";
import { searchLowes } from "./lowes";

export type SupplierSearchFn = (query: string) => Promise<SupplierProductResult[]>;

/**
 * Supplier id prefix → SerpAPI search adapter. Adding a supplier: implement `searchX`,
 * add the key here and in `supplierAdapterApiSource`, extend `SupplierProductSource` in `./types`,
 * and add the prefix to `SUPPLIER_ADAPTER_PREFIXES` in `./supplierAdapterPrefixes`.
 */
export const supplierSearchRegistry = {
  home_depot: searchHomeDepot,
  lowes: searchLowes,
  abc_supply: searchAbcSupply,
  ferguson: searchFerguson,
  grainger: searchGrainger,
} satisfies Record<SupplierAdapterPrefix, SupplierSearchFn>;

const supplierAdapterApiSource = {
  home_depot: "HOME_DEPOT",
  lowes: "LOWES",
  abc_supply: "ABC_SUPPLY",
  ferguson: "FERGUSON",
  grainger: "GRAINGER",
} as const satisfies Record<SupplierAdapterPrefix, SupplierProductSource>;

export function findSupplierSearchAdapter(supplierId: string): {
  search: SupplierSearchFn;
  apiSource: SupplierProductSource;
} | null {
  for (const prefix of SUPPLIER_ADAPTER_PREFIXES) {
    if (supplierId.startsWith(prefix)) {
      return {
        search: supplierSearchRegistry[prefix],
        apiSource: supplierAdapterApiSource[prefix],
      };
    }
  }
  return null;
}
