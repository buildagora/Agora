import type { SupplierProductResult, SupplierProductSource } from "./types";
import type { SupplierAdapterPrefix } from "./supplierAdapterPrefixes";
import { SUPPLIER_ADAPTER_PREFIXES } from "./supplierAdapterPrefixes";
import { searchAbcSupply } from "./abcSupply";
import { searchBaker } from "./baker";
import { searchEcmd } from "./ecmd";
import { searchFerguson } from "./ferguson";
import { searchGrainger } from "./grainger";
import { searchGulfeagle } from "./gulfeagle";
import { searchHomeDepot } from "./homeDepot";
import { searchJohnstone } from "./johnstone";
import { searchLansing } from "./lansing";
import { searchLennox } from "./lennox";
import { searchLowes } from "./lowes";
import { searchMaSupply } from "./maSupply";
import { searchMingledorffs } from "./mingledorffs";
import { searchQxo } from "./qxo";
import { searchReMichel } from "./reMichel";
import { searchShearer } from "./shearer";
import { searchSrs } from "./srs";
import { searchTrane } from "./trane";
import { searchWittichen } from "./wittichen";

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
  cmn90dbjr000404ldzhcsquav: searchQxo,
  srs: searchSrs,
  gulfeagle: searchGulfeagle,
  lansing: searchLansing,
  baker: searchBaker,
  johnstone: searchJohnstone,
  lennox: searchLennox,
  ma_supply: searchMaSupply,
  mingledorffs: searchMingledorffs,
  re_michel: searchReMichel,
  shearer: searchShearer,
  trane: searchTrane,
  wittichen: searchWittichen,
  ecmd: searchEcmd,
} satisfies Record<SupplierAdapterPrefix, SupplierSearchFn>;

const supplierAdapterApiSource = {
  home_depot: "HOME_DEPOT",
  lowes: "LOWES",
  abc_supply: "ABC_SUPPLY",
  ferguson: "FERGUSON",
  grainger: "GRAINGER",
  cmn90dbjr000404ldzhcsquav: "QXO",
  srs: "SRS",
  gulfeagle: "GULFEAGLE",
  lansing: "LANSING",
  baker: "BAKER",
  johnstone: "JOHNSTONE",
  lennox: "LENNOX",
  ma_supply: "MA_SUPPLY",
  mingledorffs: "MINGLEDORFFS",
  re_michel: "RE_MICHEL",
  shearer: "SHEARER",
  trane: "TRANE",
  wittichen: "WITTICHEN",
  ecmd: "ECMD",
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
