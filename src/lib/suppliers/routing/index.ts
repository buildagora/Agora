export { shadowCompare } from "./shadowCompare";
export type { ShadowCompareInput } from "./shadowCompare";
export { resolveExtractionStrategy, buildStrategyPlan } from "./resolveExtractionStrategy";
export { executeExtractionStrategyChain } from "./executeExtractionStrategyChain";
export type {
  ChainExecutionResult,
  ExecuteExtractionStrategyChainDeps,
  ExecuteExtractionStrategyChainInput,
} from "./executeExtractionStrategyChain";
export { resolveLegacyStrategy } from "./resolveLegacyStrategy";
export type { ResolveLegacyStrategyInput } from "./resolveLegacyStrategy";
export type {
  LegacyStrategyResolution,
  ResolveExtractionStrategyInput,
  ResolveExtractionStrategyOptions,
  RouterPurpose,
  ShadowComparisonResult,
  ShadowMatchStatus,
  ShadowMismatchType,
  ShadowSeverity,
  StrategyExecutionAttempt,
  StrategyPlan,
  StrategyResolution,
  StrategyTier,
  StrategyViability,
} from "./types";
export {
  EXTRACTION_STRATEGY_TIER,
  isDirectExtractionStrategy,
  strategyTier,
  TIER_1_STRATEGIES,
  TIER_4_SERP_STRATEGIES,
} from "./types";
