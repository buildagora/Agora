import { getDomainPlatformConfig } from "@/lib/suppliers/supplierDomainPlatformConfig";
import type { DomainPlatformConfig } from "@/lib/suppliers/supplierPlatformTypes";
import {
  getSupplierSiteSearchConfig,
  type SupplierConstructorConfig,
  type SupplierSiteSearchConfig,
} from "@/lib/suppliers/supplierSiteSearchConfig";

export type StorefrontSiteSearchStrategy =
  | { kind: "empty" }
  | { kind: "product_engine" }
  | {
      kind: "constructor";
      domain: string;
      source: SupplierSiteSearchConfig["source"];
      logLabel: string;
      constructorConfig: SupplierConstructorConfig;
    }
  | {
      kind: "platform_catalog";
      domain: string;
      source: SupplierSiteSearchConfig["source"];
      logLabel: string;
      config: SupplierSiteSearchConfig | DomainPlatformConfig;
    }
  | {
      kind: "site_organic";
      domain: string;
      source: SupplierSiteSearchConfig["source"];
      logLabel: string;
      extractImagesFromPage?: boolean;
    }
  | { kind: "generic_db"; domain: string; logLabel: string };

const PLATFORM_CATALOG_MODES = new Set([
  "bloomreach",
  "sli",
  "coveo",
  "algolia",
  "shopify",
  "hybris",
]);

/**
 * Pure routing for storefront Serp retrieval (testable without network or DB).
 */
export function resolveStorefrontSiteSearchStrategy(
  supplierId: string,
  dbDomain: string | null | undefined,
  logLabel: string
): StorefrontSiteSearchStrategy {
  const config = getSupplierSiteSearchConfig(supplierId);

  if (config?.mode === "product_engine") {
    return { kind: "product_engine" };
  }

  if (config?.mode === "constructor") {
    if (!config.constructorPlatform) return { kind: "empty" };
    return {
      kind: "constructor",
      domain: config.domain,
      source: config.source,
      logLabel: config.logLabel,
      constructorConfig: config.constructorPlatform,
    };
  }

  if (config && PLATFORM_CATALOG_MODES.has(config.mode)) {
    return {
      kind: "platform_catalog",
      domain: config.domain,
      source: config.source,
      logLabel: config.logLabel,
      config,
    };
  }

  if (config?.mode === "site_organic") {
    return {
      kind: "site_organic",
      domain: config.domain,
      source: config.source,
      logLabel: config.logLabel,
      extractImagesFromPage: config.extractImagesFromPage,
    };
  }

  const domain = dbDomain?.trim();
  if (!domain) return { kind: "empty" };

  const domainPlatform = getDomainPlatformConfig(domain);
  if (domainPlatform) {
    return {
      kind: "platform_catalog",
      domain,
      source: domainPlatform.source,
      logLabel: domainPlatform.logLabel,
      config: domainPlatform,
    };
  }

  return {
    kind: "generic_db",
    domain,
    logLabel,
  };
}
