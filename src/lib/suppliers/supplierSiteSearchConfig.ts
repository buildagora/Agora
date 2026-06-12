import type { SupplierAdapterPrefix } from "./supplierAdapterPrefixes";
import { SUPPLIER_ADAPTER_PREFIXES } from "./supplierAdapterPrefixes";
import type { SearchSupplierSiteParams } from "./searchSupplierSite";
import { searchSupplierSite } from "./searchSupplierSite";
import type {
  SupplierAlgoliaConfig,
  SupplierBloomreachConfig,
  SupplierCoveoConfig,
  SupplierHybrisConfig,
  SupplierShopifyConfig,
  SupplierSliConfig,
} from "./supplierPlatformTypes";
import type { SupplierProductResult, SupplierProductSource } from "./types";

export type SupplierSearchMode =
  | "product_engine"
  | "constructor"
  | "bloomreach"
  | "sli"
  | "coveo"
  | "algolia"
  | "shopify"
  | "hybris"
  | "site_organic";

export type {
  SupplierAlgoliaConfig,
  SupplierBloomreachConfig,
  SupplierCoveoConfig,
  SupplierHybrisConfig,
  SupplierShopifyConfig,
  SupplierSliConfig,
} from "./supplierPlatformTypes";

export type SupplierConstructorConfig = {
  /** Env var holding the Constructor client API key (never commit the key). */
  apiKeyEnv: string;
  imageCdnBase: string;
  siteOrigin: string;
  baseUrl?: string;
  numResultsPerPage?: number;
};

/**
 * Canonical Serp / site-search settings per registry adapter prefix.
 * Storefront, prewarm, and thin adapters should read from here — not DB domain alone.
 */
export type SupplierSiteSearchConfig = {
  mode: SupplierSearchMode;
  domain: string;
  source: SupplierProductSource;
  logLabel: string;
  extractImagesFromPage?: boolean;
  constructorPlatform?: SupplierConstructorConfig;
  bloomreach?: SupplierBloomreachConfig;
  sli?: SupplierSliConfig;
  coveo?: SupplierCoveoConfig;
  algolia?: SupplierAlgoliaConfig;
  shopify?: SupplierShopifyConfig;
  hybris?: SupplierHybrisConfig;
};

export const SUPPLIER_SITE_SEARCH_CONFIG = {
  home_depot: {
    mode: "product_engine",
    domain: "homedepot.com",
    source: "HOME_DEPOT",
    logLabel: "Home Depot",
  },
  lowes: {
    mode: "product_engine",
    domain: "lowes.com",
    source: "LOWES",
    logLabel: "Lowe's",
  },
  abc_supply: {
    mode: "site_organic",
    domain: "abcsupply.com",
    source: "ABC_SUPPLY",
    logLabel: "ABC Supply",
    extractImagesFromPage: true,
  },
  ferguson: {
    mode: "site_organic",
    domain: "ferguson.com",
    source: "FERGUSON",
    logLabel: "Ferguson",
  },
  grainger: {
    mode: "site_organic",
    domain: "grainger.com",
    source: "GRAINGER",
    logLabel: "Grainger",
  },
  cmn90dbjr000404ldzhcsquav: {
    mode: "constructor",
    domain: "qxo.com",
    source: "QXO",
    logLabel: "QXO",
    constructorPlatform: {
      apiKeyEnv: "CONSTRUCTOR_API_KEY_QXO",
      imageCdnBase: "https://static-ng.becn.digital",
      siteOrigin: "https://www.qxo.com",
      numResultsPerPage: 24,
    },
  },
  srs: {
    mode: "site_organic",
    domain: "srsdistribution.com",
    source: "SRS",
    logLabel: "SRS Building Products",
    extractImagesFromPage: true,
  },
  gulfeagle: {
    mode: "site_organic",
    domain: "gulfeaglesupply.com",
    source: "GULFEAGLE",
    logLabel: "Gulfeagle Supply",
    extractImagesFromPage: true,
  },
  lansing: {
    mode: "site_organic",
    domain: "lansingbp.com",
    source: "LANSING",
    logLabel: "Lansing Building Products",
    extractImagesFromPage: true,
  },
  baker: {
    mode: "bloomreach",
    domain: "bakerdist.com",
    source: "BAKER",
    logLabel: "Baker Distributing",
    bloomreach: {
      accountId: "6052",
      domainKey: "bakerdist",
      hostname: "search.bakerdist.com",
      baseImageUrl: "https://cdn.bakerdist.com/",
      siteOrigin: "https://www.bakerdist.com",
      authKeyEnv: "BLOOMREACH_AUTH_KEY_BAKER",
      numResults: 24,
    },
  },
  johnstone: {
    mode: "sli",
    domain: "johnstonesupply.com",
    source: "JOHNSTONE",
    logLabel: "Johnstone Supply",
    sli: {
      siteOrigin: "https://www.johnstonesupply.com",
      searchPath: "/search",
      queryParam: "searchPhrase",
      numResults: 24,
    },
  },
  lennox: {
    mode: "hybris",
    domain: "lennoxpros.com",
    source: "LENNOX",
    logLabel: "Lennox",
    hybris: {
      siteOrigin: "https://www.lennoxpros.com",
      searchPath: "/search",
      queryParam: "text",
      variant: "lennox",
      numResults: 24,
    },
  },
  ma_supply: {
    mode: "site_organic",
    domain: "masupply.com",
    source: "MA_SUPPLY",
    logLabel: "MA Supply",
  },
  mingledorffs: {
    mode: "coveo",
    domain: "mingledorffs.com",
    source: "MINGLEDORFFS",
    logLabel: "Mingledorff's",
    coveo: {
      organizationId: "",
      organizationIdEnv: "COVEO_ORG_ID_MINGLEDORFFS",
      searchHub: "default",
      searchHubEnv: "COVEO_SEARCH_HUB_MINGLEDORFFS",
      siteOrigin: "https://www.mingledorffs.com",
      apiKeyEnv: "COVEO_API_KEY_MINGLEDORFFS",
      numResults: 24,
    },
  },
  re_michel: {
    mode: "site_organic",
    domain: "remichel.com",
    source: "RE_MICHEL",
    logLabel: "R.E. Michel",
  },
  shearer: {
    mode: "site_organic",
    domain: "shearersupply.com",
    source: "SHEARER",
    logLabel: "Shearer Supply",
  },
  trane: {
    mode: "site_organic",
    domain: "trane.com",
    source: "TRANE",
    logLabel: "Trane",
  },
  wittichen: {
    mode: "site_organic",
    domain: "wittichen-supply.com",
    source: "WITTICHEN",
    logLabel: "Wittichen Supply",
  },
  ecmd: {
    mode: "bloomreach",
    domain: "ecmdi.com",
    source: "ECMD",
    logLabel: "ECMD",
    bloomreach: {
      accountId: "6054",
      domainKey: "ecmdi",
      hostname: "search.ecmdi.com",
      baseImageUrl: "https://cdn.ecmdi.com/",
      siteOrigin: "https://www.ecmdi.com",
      authKeyEnv: "BLOOMREACH_AUTH_KEY_ECMDI",
      numResults: 24,
    },
  },
} satisfies Record<SupplierAdapterPrefix, SupplierSiteSearchConfig>;

export function resolveSupplierAdapterPrefix(supplierId: string): SupplierAdapterPrefix | null {
  for (const prefix of SUPPLIER_ADAPTER_PREFIXES) {
    if (supplierId.startsWith(prefix)) return prefix;
  }
  return null;
}

export function getSupplierSiteSearchConfig(
  supplierId: string
): SupplierSiteSearchConfig | null {
  const prefix = resolveSupplierAdapterPrefix(supplierId);
  if (!prefix) return null;
  return SUPPLIER_SITE_SEARCH_CONFIG[prefix];
}

export function buildSiteSearchParams(
  prefix: SupplierAdapterPrefix,
  query: string,
  supplierIds: string[]
): SearchSupplierSiteParams {
  const config = SUPPLIER_SITE_SEARCH_CONFIG[prefix] as SupplierSiteSearchConfig;
  return {
    query,
    domain: config.domain,
    supplierIds,
    source: config.source,
    logLabel: config.logLabel,
    extractImagesFromPage: config.extractImagesFromPage,
  };
}

/** Flat discovery for API / prewarm (legacy adapter.search shape). */
export async function searchSupplierSiteForPrefix(
  prefix: SupplierAdapterPrefix,
  query: string,
  supplierIds: string[]
): Promise<SupplierProductResult[]> {
  const { searchSupplierDiscoveryForPrefix } = await import("./resolveSupplierDiscovery");
  return searchSupplierDiscoveryForPrefix(prefix, query, supplierIds);
}
