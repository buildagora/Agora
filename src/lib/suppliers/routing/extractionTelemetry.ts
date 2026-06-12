import {
  getRouterExecutionMode,
  getSupplierPromotionState,
  type RouterExecutionMode,
  type SupplierPromotionState,
} from "./routerExecutionMode";

/** Where an extraction attempt originated. */
export type SupplierExtractionEntryPoint =
  | "search_stage2"
  | "api_product_search"
  | "prewarm"
  | "storefront"
  | "supplier_detail"
  | "unknown";

/** Observed routing outcome for telemetry (includes bypass paths). */
export type SupplierExtractionObservedPath =
  | "router"
  | "legacy"
  | "legacy_fallback"
  | "adapter_bypass"
  | "unknown";

export type SupplierExtractionObservationEvent = {
  event: "supplier_extraction_observation";
  executionMode: RouterExecutionMode;
  /** Phase 8D.1 — only `promoted` when mode is promoted and supplier is in registry. */
  supplierPromotionState?: SupplierPromotionState;
  entryPoint: SupplierExtractionEntryPoint;
  executionPath: SupplierExtractionObservedPath;
  supplierId: string;
  query?: string;
  adapterBypass: boolean;
  resultCount?: number;
  strategyUsed?: string;
};

function safeJsonLog(payload: Record<string, unknown>): void {
  try {
    console.info(JSON.stringify(payload));
  } catch {
    /* telemetry must never break search */
  }
}

export function buildSupplierExtractionObservation(
  input: Omit<SupplierExtractionObservationEvent, "event" | "executionMode"> & {
    executionMode?: RouterExecutionMode;
  }
): SupplierExtractionObservationEvent {
  return {
    event: "supplier_extraction_observation",
    executionMode: input.executionMode ?? getRouterExecutionMode(),
    supplierPromotionState:
      input.supplierPromotionState ?? getSupplierPromotionState(input.supplierId),
    entryPoint: input.entryPoint,
    executionPath: input.executionPath,
    supplierId: input.supplierId,
    query: input.query,
    adapterBypass: input.adapterBypass,
    resultCount: input.resultCount,
    strategyUsed: input.strategyUsed,
  };
}

export function logSupplierExtractionObservation(
  input: Omit<SupplierExtractionObservationEvent, "event" | "executionMode"> & {
    executionMode?: RouterExecutionMode;
  }
): void {
  safeJsonLog(buildSupplierExtractionObservation(input));
}

/** Log when legacy adapter short-circuits router orchestrator. Observability only. */
export function logAdapterBypassObservation(input: {
  supplierId: string;
  entryPoint: SupplierExtractionEntryPoint;
  query?: string;
  resultCount?: number;
  strategyUsed?: string;
}): void {
  logSupplierExtractionObservation({
    entryPoint: input.entryPoint,
    executionPath: "adapter_bypass",
    supplierId: input.supplierId,
    query: input.query,
    adapterBypass: true,
    resultCount: input.resultCount,
    strategyUsed: input.strategyUsed,
  });
}
