import type { DomainPlatformConfig } from "./supplierPlatformTypes";

/**
 * Platform-native catalog search for suppliers without a registry prefix.
 * Keyed by normalized domain (lowercase, no protocol).
 */
export const SUPPLIER_DOMAIN_PLATFORM_CONFIG: Record<string, DomainPlatformConfig> = {
  "ecmdi.com": {
    mode: "bloomreach",
    source: "GENERIC",
    logLabel: "East Coast Metal Distributors",
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
  "siteone.com": {
    mode: "hybris",
    source: "GENERIC",
    logLabel: "SiteOne Landscape Supply",
    hybris: {
      siteOrigin: "https://www.siteone.com",
      searchPath: "/en/search",
      queryParam: "text",
      variant: "siteone",
      numResults: 24,
    },
  },
  "harborfreight.com": {
    mode: "bloomreach",
    source: "GENERIC",
    logLabel: "Harbor Freight Tools",
    bloomreach: {
      accountId: "",
      domainKey: "",
      accountIdEnv: "BLOOMREACH_ACCOUNT_ID_HARBOR_FREIGHT",
      domainKeyEnv: "BLOOMREACH_DOMAIN_KEY_HARBOR_FREIGHT",
      hostname: "core.dxpapi.com",
      baseImageUrl: "https://www.harborfreight.com/",
      siteOrigin: "https://www.harborfreight.com",
      authKeyEnv: "BLOOMREACH_AUTH_KEY_HARBOR_FREIGHT",
      numResults: 24,
    },
  },
  "myfbm.com": {
    mode: "bloomreach",
    source: "GENERIC",
    logLabel: "Foundation Building Materials",
    bloomreach: {
      accountId: "",
      domainKey: "",
      accountIdEnv: "BLOOMREACH_ACCOUNT_ID_FBM",
      domainKeyEnv: "BLOOMREACH_DOMAIN_KEY_FBM",
      hostname: "core.dxpapi.com",
      baseImageUrl: "https://www.myfbm.com/",
      siteOrigin: "https://www.myfbm.com",
      authKeyEnv: "BLOOMREACH_AUTH_KEY_FBM",
      numResults: 24,
    },
  },
  "lumberliquidators.com": {
    mode: "shopify",
    source: "GENERIC",
    logLabel: "Lumber Liquidators",
    shopify: {
      siteOrigin: "https://www.lumberliquidators.com",
      suggestPath: "/search/suggest.json",
      numResults: 24,
    },
  },
  "flooranddecor.com": {
    mode: "algolia",
    source: "GENERIC",
    logLabel: "Floor & Decor",
    algolia: {
      appId: "AR91I5G1KF",
      indexName: "production__products__default",
      siteOrigin: "https://www.flooranddecor.com",
      /** Algolia search-only key (public on storefront) */
      searchApiKey: "a107b054c16c35a5033915306c8eaf45",
      numResults: 24,
    },
  },
  "ppgpaints.com": {
    mode: "algolia",
    source: "GENERIC",
    logLabel: "PPG Paints",
    algolia: {
      /** Search-only key published on storefront (Phase 8F.2). */
      appId: "RG6LZNMOGC",
      indexName: "prd_MBProducts",
      siteOrigin: "https://www.ppgpaints.com",
      searchApiKey: "ef45d97ef63234f4c54db0c45d3578a8",
      numResults: 24,
    },
  },
};

export function getDomainPlatformConfig(domain: string | null | undefined): DomainPlatformConfig | null {
  const normalized = domain?.trim().toLowerCase();
  if (!normalized) return null;
  return SUPPLIER_DOMAIN_PLATFORM_CONFIG[normalized] ?? null;
}
