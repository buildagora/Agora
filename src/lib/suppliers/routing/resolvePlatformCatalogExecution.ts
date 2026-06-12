import type { PlatformAccessStatus } from "@prisma/client";
import type { SupplierFingerprintFacts } from "../fingerprint/types";
import { getDomainPlatformConfig } from "../supplierDomainPlatformConfig";
import type { DomainPlatformConfig } from "../supplierPlatformTypes";
import {
  getSupplierSiteSearchConfig,
  type SupplierSearchMode,
  type SupplierSiteSearchConfig,
} from "../supplierSiteSearchConfig";
import type { SupplierProductSource } from "../types";

const PLATFORM_CATALOG_MODES = new Set<SupplierSearchMode>([
  "constructor",
  "bloomreach",
  "sli",
  "coveo",
  "algolia",
  "shopify",
  "hybris",
]);

export type PlatformCatalogExecutionConfig = {
  source: SupplierProductSource;
  logLabel: string;
  config: SupplierSiteSearchConfig | DomainPlatformConfig;
};

function isPlatformCatalogMode(mode: SupplierSearchMode | DomainPlatformConfig["mode"]): boolean {
  return PLATFORM_CATALOG_MODES.has(mode as SupplierSearchMode);
}

const BLOCKED_PUBLIC_API_ACCESS = new Set<PlatformAccessStatus>([
  "BINDING_INCOMPLETE",
  "REQUIRES_AUTH",
  "REQUIRES_CONTRACT",
  "BLOCKED",
]);

/**
 * Runtime guard for PUBLIC_API execution — mirrors router viability rules.
 */
export function isPublicApiExecutionAllowed(
  facts: SupplierFingerprintFacts
): boolean {
  if (facts.detectedPlatform === "UNKNOWN") {
    return false;
  }
  if (BLOCKED_PUBLIC_API_ACCESS.has(facts.platformAccessStatus)) {
    return false;
  }
  if (facts.publicApiAccessStatus === "ACCESSIBLE") {
    return true;
  }
  if (facts.platformAccessStatus === "PUBLIC_ANONYMOUS") {
    return true;
  }
  return false;
}

/**
 * Runtime guard for PLATFORM_API execution — mirrors router viability rules.
 */
export function isPlatformApiExecutionAllowed(
  facts: SupplierFingerprintFacts
): boolean {
  if (facts.detectedPlatform === "UNKNOWN") {
    return false;
  }
  if (facts.platformAccessStatus !== "ACCESSIBLE") {
    return false;
  }
  return true;
}

/**
 * Resolve existing platform catalog config for executePlatformCatalogSearch.
 * Registry prefix (Johnstone / SLI) first, then domain platform config.
 */
export function resolvePlatformCatalogExecution(
  supplierId: string,
  dbDomain?: string | null
): PlatformCatalogExecutionConfig | null {
  const registryConfig = getSupplierSiteSearchConfig(supplierId);
  if (registryConfig && isPlatformCatalogMode(registryConfig.mode)) {
    return {
      source: registryConfig.source,
      logLabel: registryConfig.logLabel,
      config: registryConfig,
    };
  }

  const domain = dbDomain?.trim();
  if (domain) {
    const domainConfig = getDomainPlatformConfig(domain);
    if (domainConfig && isPlatformCatalogMode(domainConfig.mode)) {
      return {
        source: domainConfig.source,
        logLabel: domainConfig.logLabel,
        config: domainConfig,
      };
    }
  }

  return null;
}
