import type {
  ExtractionStrategy,
  FingerprintStatus,
  PlatformAccessStatus,
  SupplierPlatform,
} from "@prisma/client";
import type { SupplierExtractionEntryPoint } from "./extractionTelemetry";
import type {
  RouterExecutionMode,
  SupplierPromotionState,
} from "./routerExecutionMode";
import type {
  ShadowMatchStatus,
  ShadowMismatchType,
  ShadowSeverity,
  StrategyExecutionAttempt,
  StrategyPlan,
  StrategyResolution,
  StrategyTier,
} from "./types";

export type SupplierExtractionExecutionPath =
  | "legacy"
  | "router"
  | "legacy_fallback";

/**
 * Unified Phase 1B route telemetry event.
 * Chain/plan scalars use safe defaults when router execution did not run.
 */
export type SupplierExtractionRouteEvent = {
  event: "supplier_extraction_route";
  supplierId: string;
  explanation: string;
  executionPath: SupplierExtractionExecutionPath;
  /** Phase 8A — control plane mode at observation time. */
  executionMode?: RouterExecutionMode;
  /** Phase 8D.1 — Wave 1 promotion state for this supplier. */
  supplierPromotionState?: SupplierPromotionState;
  /** Phase 8A — request origin. */
  entryPoint?: SupplierExtractionEntryPoint;
  shadowEnabled: boolean;
  routerEnabled: boolean;
  routerExecutionAttempted: boolean;
  allowlisted: boolean;
  legacyStrategy?: ExtractionStrategy;
  routerStrategy?: ExtractionStrategy;
  primaryStrategy?: ExtractionStrategy;
  fallbackChain: ExtractionStrategy[];
  fullOrderedChain: ExtractionStrategy[];
  attemptedStrategies: StrategyExecutionAttempt[];
  finalStrategyUsed?: ExtractionStrategy;
  fallbackDepth: number;
  chainExhausted: boolean;
  matchStatus?: ShadowMatchStatus;
  mismatchType?: ShadowMismatchType;
  severity?: ShadowSeverity;
  fallbackReason?: string;
  resultCountRouter?: number;
  resultCountLegacy?: number;
  latencyMsRouter?: number;
  latencyMsLegacy?: number;
  fingerprintStatus?: FingerprintStatus;
  detectedPlatform?: SupplierPlatform;
  platformAccessStatus?: PlatformAccessStatus;
  routerTier?: StrategyTier;
};

/** @deprecated Phase 1A event shape — use logSupplierExtractionRoute */
export type SupplierExtractionShadowEvent = {
  event: "supplier_extraction_shadow";
  supplierId: string;
  legacyStrategy?: ExtractionStrategy;
  routerStrategy?: ExtractionStrategy;
  matchStatus?: ShadowMatchStatus;
  mismatchType?: ShadowMismatchType;
  severity?: ShadowSeverity;
  explanation: string;
  executionPath: "legacy";
  shadowEnabled: true;
  fingerprintStatus?: FingerprintStatus;
  detectedPlatform?: SupplierPlatform;
  platformAccessStatus?: PlatformAccessStatus;
  routerTier?: StrategyTier;
};

export type SupplierExtractionShadowSkippedEvent = {
  event: "supplier_extraction_shadow";
  supplierId: string;
  explanation: "fingerprint_missing";
  executionPath: "legacy";
  shadowEnabled: true;
};

export type RouterChainTelemetryInput = {
  router?: StrategyPlan | StrategyResolution;
  attemptedStrategies?: StrategyExecutionAttempt[];
  finalStrategyUsed?: ExtractionStrategy;
  fallbackDepth?: number;
  chainExhausted?: boolean;
  latencyMsRouter?: number;
  resultCountRouter?: number;
};

/** Apply safe defaults for plan/chain telemetry fields. */
export function buildRouterChainTelemetryFields(
  input: RouterChainTelemetryInput = {}
): Pick<
  SupplierExtractionRouteEvent,
  | "primaryStrategy"
  | "fallbackChain"
  | "fullOrderedChain"
  | "attemptedStrategies"
  | "finalStrategyUsed"
  | "fallbackDepth"
  | "chainExhausted"
  | "latencyMsRouter"
  | "resultCountRouter"
> {
  return {
    primaryStrategy: input.router?.primaryStrategy,
    fallbackChain: input.router?.fallbackChain ?? [],
    fullOrderedChain: input.router?.fullOrderedChain ?? [],
    attemptedStrategies: input.attemptedStrategies ?? [],
    finalStrategyUsed: input.finalStrategyUsed,
    fallbackDepth: input.fallbackDepth ?? 0,
    chainExhausted: input.chainExhausted ?? false,
    latencyMsRouter: input.latencyMsRouter,
    resultCountRouter: input.resultCountRouter,
  };
}

/** Normalize route event — strips undefined optional fields for stable JSON. */
export function buildSupplierExtractionRouteEvent(
  payload: SupplierExtractionRouteEvent
): SupplierExtractionRouteEvent {
  const normalized: Record<string, unknown> = {
    event: "supplier_extraction_route",
    supplierId: payload.supplierId,
    explanation: payload.explanation,
    executionPath: payload.executionPath,
    shadowEnabled: payload.shadowEnabled,
    routerEnabled: payload.routerEnabled,
    routerExecutionAttempted: payload.routerExecutionAttempted,
    allowlisted: payload.allowlisted,
    fallbackChain: payload.fallbackChain ?? [],
    fullOrderedChain: payload.fullOrderedChain ?? [],
    attemptedStrategies: payload.attemptedStrategies ?? [],
    fallbackDepth: payload.fallbackDepth ?? 0,
    chainExhausted: payload.chainExhausted ?? false,
  };

  const optionalKeys = [
    "executionMode",
    "supplierPromotionState",
    "entryPoint",
    "legacyStrategy",
    "routerStrategy",
    "primaryStrategy",
    "finalStrategyUsed",
    "matchStatus",
    "mismatchType",
    "severity",
    "fallbackReason",
    "resultCountRouter",
    "resultCountLegacy",
    "latencyMsRouter",
    "latencyMsLegacy",
    "fingerprintStatus",
    "detectedPlatform",
    "platformAccessStatus",
    "routerTier",
  ] as const;

  for (const key of optionalKeys) {
    const value = payload[key as keyof SupplierExtractionRouteEvent];
    if (value !== undefined) {
      normalized[key] = value;
    }
  }

  return normalized as SupplierExtractionRouteEvent;
}

export function logSupplierExtractionRoute(
  payload: SupplierExtractionRouteEvent
): void {
  try {
    const event = buildSupplierExtractionRouteEvent(payload);
    console.info(JSON.stringify(event));
  } catch {
    /* telemetry must never break search */
  }
}

/** Phase 1A compare-only logging (shadow-only callers). */
export function logSupplierExtractionShadow(
  payload: SupplierExtractionShadowEvent | SupplierExtractionShadowSkippedEvent
): void {
  try {
    console.info(JSON.stringify(payload));
  } catch {
    /* telemetry must never break search */
  }
}
