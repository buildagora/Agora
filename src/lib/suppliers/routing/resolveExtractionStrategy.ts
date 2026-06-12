import type { ExtractionStrategy } from "@prisma/client";
import {
  evaluateAllStrategyViabilities,
  primaryReasonForStrategy,
} from "./evaluateStrategyViability";
import type {
  ResolveExtractionStrategyInput,
  StrategyPlan,
  StrategyResolution,
} from "./types";
import { isDirectExtractionStrategy, strategyTier } from "./types";

function buildStrategyPlan(input: ResolveExtractionStrategyInput): StrategyPlan {
  const { viabilityByStrategy, decisionTrace } =
    evaluateAllStrategyViabilities(input);

  const fullOrderedChain = viabilityByStrategy
    .filter((entry) => entry.viable)
    .map((entry) => entry.strategy);

  const primaryStrategy = fullOrderedChain[0] ?? "PROBABILISTIC_CATEGORY_PROFILE";
  const fallbackChain = fullOrderedChain.slice(1);

  const primaryViability =
    viabilityByStrategy.find((entry) => entry.strategy === primaryStrategy) ??
    viabilityByStrategy[viabilityByStrategy.length - 1];

  return {
    primaryStrategy,
    fallbackChain,
    fullOrderedChain,
    viabilityByStrategy,
    strategyReason:
      primaryViability?.reason ?? primaryReasonForStrategy(primaryStrategy),
    strategyConfidence: primaryViability?.confidence ?? 0.5,
    directExtractionViable: isDirectExtractionStrategy(primaryStrategy),
    tier: strategyTier(primaryStrategy),
    decisionTrace,
  };
}

/**
 * Pure extraction strategy router (facts in → plan out; never writes DB).
 */
export function resolveExtractionStrategy(
  input: ResolveExtractionStrategyInput
): StrategyResolution {
  const plan = buildStrategyPlan(input);
  return {
    ...plan,
    chosenStrategy: plan.primaryStrategy,
    fallbackStrategy: plan.fallbackChain[0],
  };
}

/** Exposed for tests and future chain execution. */
export { buildStrategyPlan };
