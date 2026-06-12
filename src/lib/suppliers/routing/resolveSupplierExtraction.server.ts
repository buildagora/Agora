import { loadSupplierFingerprintFacts } from "../fingerprint/loadSupplierFingerprintFacts.server";
import type { SupplierFingerprintFacts } from "../fingerprint/types";
import type { SupplierProductResult } from "../types";
import {
  executeExtractionStrategyChain,
  type ExecuteExtractionStrategyChainDeps,
} from "./executeExtractionStrategyChain";
import type { SupplierExtractionEntryPoint } from "./extractionTelemetry";
import {
  getFingerprintRouterExecutionTimeoutMs,
  isFingerprintRouterEnabled,
  isFingerprintRouterShadowEnabled,
  isSupplierAllowlisted,
} from "./routerFlags";
import { getRouterExecutionMode, getSupplierPromotionState, isRouterEligibleSupplier } from "./routerExecutionMode";
import {
  buildRouterChainTelemetryFields,
  logSupplierExtractionRoute,
  logSupplierExtractionShadow,
  type SupplierExtractionRouteEvent,
  type SupplierExtractionShadowEvent,
  type SupplierExtractionShadowSkippedEvent,
} from "./routerTelemetry";
import { resolveExtractionStrategy } from "./resolveExtractionStrategy";
import { resolveLegacyStrategy } from "./resolveLegacyStrategy";
import { shadowCompare } from "./shadowCompare";
import type { StrategyResolution } from "./types";

export type RunFingerprintShadowInput = {
  supplierId: string;
  canonicalDomain?: string | null;
};

/** Injectable deps for unit tests only. */
export type RunFingerprintShadowDeps = {
  isShadowEnabled?: () => boolean;
  loadFacts?: (supplierId: string) => Promise<SupplierFingerprintFacts | null>;
  logShadow?: (
    payload: SupplierExtractionShadowEvent | SupplierExtractionShadowSkippedEvent
  ) => void;
};

export type RunSupplierDiscoveryRoutingInput = {
  supplierId: string;
  query: string;
  dbDomain?: string | null;
  /** Phase 8A — telemetry only; does not affect routing. */
  entryPoint?: SupplierExtractionEntryPoint;
};

export type RunSupplierDiscoveryRoutingDeps = {
  isShadowEnabled?: () => boolean;
  isRouterEnabled?: () => boolean;
  isAllowlisted?: (supplierId: string) => boolean;
  loadFacts?: (supplierId: string) => Promise<SupplierFingerprintFacts | null>;
  executeChain?: (
    input: Parameters<typeof executeExtractionStrategyChain>[0],
    deps?: ExecuteExtractionStrategyChainDeps
  ) => ReturnType<typeof executeExtractionStrategyChain>;
  logRoute?: (payload: SupplierExtractionRouteEvent) => void;
  executionTimeoutMs?: number;
};

function buildCompareContext(
  input: RunSupplierDiscoveryRoutingInput,
  facts: SupplierFingerprintFacts
) {
  const domain = input.dbDomain ?? facts.canonicalDomain;
  const legacy = resolveLegacyStrategy({
    supplierId: input.supplierId,
    canonicalDomain: domain,
    legacySnapshot: facts.legacySnapshot,
  });
  const router = resolveExtractionStrategy({
    supplierId: input.supplierId,
    canonicalDomain: domain,
    facts,
    legacySnapshot: facts.legacySnapshot,
    options: { purpose: "production" },
  });
  const comparison = shadowCompare({ legacy, router, facts });
  return { legacy, router, comparison, domain };
}

function baseRouteTelemetry(
  input: RunSupplierDiscoveryRoutingInput,
  facts: SupplierFingerprintFacts | null,
  router: StrategyResolution | undefined,
  comparison: ReturnType<typeof shadowCompare> | undefined,
  shadowEnabled: boolean,
  routerEnabled: boolean,
  allowlisted: boolean
): Pick<
  SupplierExtractionRouteEvent,
  | "supplierId"
  | "shadowEnabled"
  | "routerEnabled"
  | "allowlisted"
  | "legacyStrategy"
  | "routerStrategy"
  | "primaryStrategy"
  | "fallbackChain"
  | "fullOrderedChain"
  | "attemptedStrategies"
  | "fallbackDepth"
  | "chainExhausted"
  | "matchStatus"
  | "mismatchType"
  | "severity"
  | "explanation"
  | "fingerprintStatus"
  | "detectedPlatform"
  | "platformAccessStatus"
  | "routerTier"
> {
  return {
    supplierId: input.supplierId,
    explanation: comparison?.explanation ?? "fingerprint_missing",
    shadowEnabled,
    routerEnabled,
    allowlisted,
    legacyStrategy: comparison?.legacyStrategy,
    routerStrategy: comparison?.routerStrategy,
    matchStatus: comparison?.matchStatus,
    mismatchType: comparison?.mismatchType,
    severity: comparison?.severity,
    fingerprintStatus: facts?.fingerprintStatus,
    detectedPlatform: facts?.detectedPlatform,
    platformAccessStatus: facts?.platformAccessStatus,
    routerTier: comparison?.routerTier,
    ...buildRouterChainTelemetryFields({ router }),
  };
}

function preExecutionFallbackReason(input: {
  allowlisted: boolean;
  matchStatus: string;
}): string {
  if (!input.allowlisted) return "not_allowlisted";
  if (input.matchStatus === "INVESTIGATE") return "investigate_mismatch";
  return "router_error";
}

function routeTelemetryContext(
  input: RunSupplierDiscoveryRoutingInput
): Pick<
  SupplierExtractionRouteEvent,
  "executionMode" | "entryPoint" | "supplierPromotionState"
> {
  return {
    executionMode: getRouterExecutionMode(),
    entryPoint: input.entryPoint ?? "unknown",
    supplierPromotionState: getSupplierPromotionState(input.supplierId),
  };
}

/**
 * Phase 1A shadow hook: compare router vs legacy labels and log. Never executes extraction.
 * Never throws — safe to fire-and-forget from the discovery hot path.
 */
export async function runFingerprintShadow(
  input: RunFingerprintShadowInput,
  deps?: RunFingerprintShadowDeps
): Promise<void> {
  try {
    const isEnabled = deps?.isShadowEnabled ?? isFingerprintRouterShadowEnabled;
    if (!isEnabled()) return;

    const loadFacts = deps?.loadFacts ?? loadSupplierFingerprintFacts;
    const logShadow = deps?.logShadow ?? logSupplierExtractionShadow;
    const facts = await loadFacts(input.supplierId);

    if (!facts) {
      logShadow({
        event: "supplier_extraction_shadow",
        supplierId: input.supplierId,
        explanation: "fingerprint_missing",
        executionPath: "legacy",
        shadowEnabled: true,
      });
      return;
    }

    const { comparison } = buildCompareContext(
      {
        supplierId: input.supplierId,
        query: "",
        dbDomain: input.canonicalDomain,
      },
      facts
    );

    logShadow({
      event: "supplier_extraction_shadow",
      supplierId: input.supplierId,
      legacyStrategy: comparison.legacyStrategy,
      routerStrategy: comparison.routerStrategy,
      matchStatus: comparison.matchStatus,
      mismatchType: comparison.mismatchType,
      severity: comparison.severity,
      explanation: comparison.explanation,
      executionPath: "legacy",
      shadowEnabled: true,
      fingerprintStatus: facts.fingerprintStatus,
      detectedPlatform: facts.detectedPlatform,
      platformAccessStatus: facts.platformAccessStatus,
      routerTier: comparison.routerTier,
    });
  } catch {
    /* shadow must never break search */
  }
}

/**
 * Phase 1B orchestrator: walk router strategy chain when allowed; legacy after exhaustion.
 * Never throws — errors fall back to legacy discovery.
 */
export async function runSupplierDiscoveryRouting(
  input: RunSupplierDiscoveryRoutingInput,
  legacyDiscovery: () => Promise<SupplierProductResult[]>,
  deps?: RunSupplierDiscoveryRoutingDeps
): Promise<SupplierProductResult[]> {
  const shadowEnabled =
    deps?.isShadowEnabled?.() ?? isFingerprintRouterShadowEnabled();
  const routerEnabled = deps?.isRouterEnabled?.() ?? isFingerprintRouterEnabled();

  if (!shadowEnabled && !routerEnabled) {
    return legacyDiscovery();
  }

  const loadFacts = deps?.loadFacts ?? loadSupplierFingerprintFacts;
  const logRoute = deps?.logRoute ?? logSupplierExtractionRoute;
  const executeChain = deps?.executeChain ?? executeExtractionStrategyChain;
  const timeoutMs =
    deps?.executionTimeoutMs ?? getFingerprintRouterExecutionTimeoutMs();
  const isAllowlisted = deps?.isAllowlisted ?? isSupplierAllowlisted;

  try {
    const facts = await loadFacts(input.supplierId);
    const allowlisted = isAllowlisted(input.supplierId);

    if (!facts) {
      const legacyStart = Date.now();
      const legacyResults = await legacyDiscovery();
      const latencyMsLegacy = Date.now() - legacyStart;
      logRoute({
        event: "supplier_extraction_route",
        ...baseRouteTelemetry(
          input,
          null,
          undefined,
          undefined,
          shadowEnabled,
          routerEnabled,
          allowlisted
        ),
        ...routeTelemetryContext(input),
        executionPath: routerEnabled ? "legacy_fallback" : "legacy",
        routerExecutionAttempted: false,
        fallbackReason: routerEnabled ? "fingerprint_missing" : undefined,
        resultCountLegacy: legacyResults.length,
        latencyMsLegacy,
      });
      return legacyResults;
    }

    const { comparison, router } = buildCompareContext(input, facts);

    const routerEligible = isRouterEligibleSupplier(input.supplierId, allowlisted);
    const shouldWalkChain =
      routerEnabled &&
      routerEligible &&
      comparison.matchStatus !== "INVESTIGATE";

    let fallbackReason: string | undefined;
    let routerExecutionAttempted = false;

    if (shouldWalkChain) {
      routerExecutionAttempted = true;
      const chainStart = Date.now();
      const chainResult = await executeChain(
        {
          plan: router,
          supplierId: input.supplierId,
          query: input.query,
          dbDomain: input.dbDomain,
          facts,
        },
        { executionTimeoutMs: timeoutMs }
      );
      const latencyMsRouter = Date.now() - chainStart;
      const chainTelemetry = buildRouterChainTelemetryFields({
        router,
        attemptedStrategies: chainResult.attempts,
        finalStrategyUsed: chainResult.finalStrategyUsed,
        fallbackDepth: chainResult.fallbackDepth,
        chainExhausted: chainResult.chainExhausted,
        latencyMsRouter,
        resultCountRouter: chainResult.results.length,
      });

      if (!chainResult.chainExhausted && chainResult.finalStrategyUsed) {
        logRoute({
          event: "supplier_extraction_route",
          ...baseRouteTelemetry(
            input,
            facts,
            router,
            comparison,
            shadowEnabled,
            routerEnabled,
            allowlisted
          ),
          ...chainTelemetry,
          ...routeTelemetryContext(input),
          executionPath: "router",
          routerExecutionAttempted: true,
        });
        return chainResult.results;
      }

      fallbackReason = "chain_exhausted";
      const legacyStart = Date.now();
      const legacyResults = await legacyDiscovery();
      const latencyMsLegacy = Date.now() - legacyStart;

      logRoute({
        event: "supplier_extraction_route",
        ...baseRouteTelemetry(
          input,
          facts,
          router,
          comparison,
          shadowEnabled,
          routerEnabled,
          allowlisted
        ),
        ...chainTelemetry,
        ...routeTelemetryContext(input),
        executionPath: "legacy_fallback",
        routerExecutionAttempted: true,
        fallbackReason,
        resultCountLegacy: legacyResults.length,
        latencyMsLegacy,
      });
      return legacyResults;
    }

    if (routerEnabled) {
      fallbackReason = preExecutionFallbackReason({
        allowlisted,
        matchStatus: comparison.matchStatus,
      });
    }

    const legacyStart = Date.now();
    const legacyResults = await legacyDiscovery();
    const latencyMsLegacy = Date.now() - legacyStart;

    logRoute({
      event: "supplier_extraction_route",
      ...baseRouteTelemetry(
        input,
        facts,
        router,
        comparison,
        shadowEnabled,
        routerEnabled,
        allowlisted
      ),
      ...routeTelemetryContext(input),
      executionPath: routerEnabled ? "legacy_fallback" : "legacy",
      routerExecutionAttempted,
      fallbackReason,
      resultCountLegacy: legacyResults.length,
      latencyMsLegacy,
    });
    return legacyResults;
  } catch {
    return legacyDiscovery();
  }
}
