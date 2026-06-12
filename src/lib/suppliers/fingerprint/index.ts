export { resolveDemandPriority } from "./aggregateDemand";
export { buildFactsFromLegacy, DOMAIN_PLATFORM_KEYS } from "./buildFactsFromLegacy";
export { normalizeCanonicalDomain } from "./normalizeCanonicalDomain";
export { resolvePlatformAccess } from "./resolvePlatformAccess";
export type { PlatformAccessContext } from "./resolvePlatformAccess";
export type {
  BuildFactsFromLegacyInput,
  DemandResolution,
  EnvKeyPresence,
  LegacyStrategySnapshot,
  PlatformAccessResolution,
  SupplierFingerprintFacts,
  SupplierLike,
} from "./types";
