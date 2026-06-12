import type { SupplierPlatform } from "@prisma/client";
import type {
  SupplierAlgoliaConfig,
  SupplierBloomreachConfig,
  SupplierCoveoConfig,
  SupplierHybrisConfig,
} from "../supplierPlatformTypes";
import type { SupplierConstructorConfig, SupplierSearchMode } from "../supplierSiteSearchConfig";
import type { EnvKeyPresence, PlatformAccessResolution } from "./types";

export type PlatformAccessContext = {
  platform: SupplierPlatform;
  /** Legacy site-search or domain-platform mode when known. */
  legacyMode?: SupplierSearchMode | "bloomreach" | "sli" | "coveo" | "algolia" | "shopify" | "hybris";
  constructorConfig?: SupplierConstructorConfig;
  bloomreachConfig?: SupplierBloomreachConfig;
  coveoConfig?: SupplierCoveoConfig;
  algoliaConfig?: SupplierAlgoliaConfig;
  hybrisConfig?: SupplierHybrisConfig;
  envKeyPresence: EnvKeyPresence;
};

function envPresent(envKeyPresence: EnvKeyPresence, key: string | undefined): boolean {
  if (!key) return true;
  return envKeyPresence[key] === true;
}

function allEnvPresent(envKeyPresence: EnvKeyPresence, keys: string[]): boolean {
  return keys.every((key) => envPresent(envKeyPresence, key));
}

function collectBloomreachEnvKeys(config: SupplierBloomreachConfig): string[] {
  const keys: string[] = [];
  if (config.authKeyEnv) keys.push(config.authKeyEnv);
  if (!config.accountId?.trim() && config.accountIdEnv) {
    keys.push(config.accountIdEnv);
  }
  if (!config.domainKey?.trim() && config.domainKeyEnv) {
    keys.push(config.domainKeyEnv);
  }
  return keys;
}

function collectCoveoEnvKeys(config: SupplierCoveoConfig): string[] {
  const keys: string[] = [config.apiKeyEnv];
  if (!config.organizationId?.trim() && config.organizationIdEnv) {
    keys.push(config.organizationIdEnv);
  }
  if (!config.searchHub?.trim() && config.searchHubEnv) {
    keys.push(config.searchHubEnv);
  }
  return keys;
}

function collectAlgoliaEnvKeys(config: SupplierAlgoliaConfig): string[] {
  const keys: string[] = [];
  if (config.apiKeyEnv) keys.push(config.apiKeyEnv);
  if (!config.appId?.trim() && config.appIdEnv) keys.push(config.appIdEnv);
  if (!config.indexName?.trim() && config.indexNameEnv) {
    keys.push(config.indexNameEnv);
  }
  return keys;
}

function bindingValid(status: PlatformAccessResolution["platformAccessStatus"]): boolean {
  return status === "ACCESSIBLE" || status === "PUBLIC_ANONYMOUS";
}

/**
 * Static platform access from legacy config shape and env-key presence (no live probes).
 */
export function resolvePlatformAccess(
  context: PlatformAccessContext
): PlatformAccessResolution {
  const { platform, envKeyPresence } = context;

  if (platform === "UNKNOWN") {
    return {
      platformAccessStatus: "NOT_APPLICABLE",
      platformBindingValid: false,
      evaluatedEnvKeys: [],
    };
  }

  if (platform === "SHOPIFY") {
    return {
      platformAccessStatus: "PUBLIC_ANONYMOUS",
      platformBindingValid: true,
      evaluatedEnvKeys: [],
    };
  }

  if (platform === "SLI") {
    return {
      platformAccessStatus: "ACCESSIBLE",
      platformBindingValid: true,
      evaluatedEnvKeys: [],
    };
  }

  if (platform === "HYBRIS") {
    if (context.legacyMode === "hybris" && context.hybrisConfig) {
      return {
        platformAccessStatus: "ACCESSIBLE",
        platformBindingValid: true,
        evaluatedEnvKeys: [],
      };
    }
    return {
      platformAccessStatus: "REQUIRES_AUTH",
      platformBindingValid: false,
      evaluatedEnvKeys: [],
    };
  }

  if (platform === "ALGOLIA" && context.algoliaConfig) {
    if (context.algoliaConfig.searchApiKey?.trim()) {
      return {
        platformAccessStatus: "PUBLIC_ANONYMOUS",
        platformBindingValid: true,
        evaluatedEnvKeys: [],
      };
    }
    const evaluatedEnvKeys = collectAlgoliaEnvKeys(context.algoliaConfig);
    const status = allEnvPresent(envKeyPresence, evaluatedEnvKeys)
      ? "ACCESSIBLE"
      : "BINDING_INCOMPLETE";
    return {
      platformAccessStatus: status,
      platformBindingValid: bindingValid(status),
      evaluatedEnvKeys,
    };
  }

  if (platform === "CONSTRUCTOR" && context.constructorConfig) {
    const evaluatedEnvKeys = [context.constructorConfig.apiKeyEnv];
    const status = envPresent(envKeyPresence, context.constructorConfig.apiKeyEnv)
      ? "ACCESSIBLE"
      : "BINDING_INCOMPLETE";
    return {
      platformAccessStatus: status,
      platformBindingValid: bindingValid(status),
      evaluatedEnvKeys,
    };
  }

  if (platform === "BLOOMREACH" && context.bloomreachConfig) {
    const evaluatedEnvKeys = collectBloomreachEnvKeys(context.bloomreachConfig);
    const status = allEnvPresent(envKeyPresence, evaluatedEnvKeys)
      ? "ACCESSIBLE"
      : "BINDING_INCOMPLETE";
    return {
      platformAccessStatus: status,
      platformBindingValid: bindingValid(status),
      evaluatedEnvKeys,
    };
  }

  if (platform === "COVEO" && context.coveoConfig) {
    const evaluatedEnvKeys = collectCoveoEnvKeys(context.coveoConfig);
    const status = allEnvPresent(envKeyPresence, evaluatedEnvKeys)
      ? "ACCESSIBLE"
      : "BINDING_INCOMPLETE";
    return {
      platformAccessStatus: status,
      platformBindingValid: bindingValid(status),
      evaluatedEnvKeys,
    };
  }

  return {
    platformAccessStatus: "NOT_APPLICABLE",
    platformBindingValid: false,
    evaluatedEnvKeys: [],
  };
}
