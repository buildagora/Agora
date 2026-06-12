/**
 * Phase 8E.0 — unified orchestrator-first routing for promoted suppliers.
 *
 * When `executionMode=promoted` and a supplier is in
 * `FINGERPRINT_ROUTER_PROMOTED_SUPPLIERS`, all converged entry points
 * (Search, API, Prewarm, Storefront) call `searchSupplierDiscoveryForSupplier()`
 * instead of adapter-first or storefront-strategy-first bypasses.
 *
 * Rollback (no cohort code required):
 *   FINGERPRINT_ROUTER_EXECUTION_MODE=allowlist
 *   FINGERPRINT_ROUTER_PROMOTED_SUPPLIERS=
 *
 * Emergency kill switches (optional):
 *   FINGERPRINT_PROMOTED_ORCHESTRATOR_ROUTING_DISABLED=true
 *   FINGERPRINT_API_ORCHESTRATOR_CONVERGENCE_DISABLED=true
 *   FINGERPRINT_STOREFRONT_ORCHESTRATOR_CONVERGENCE_DISABLED=true
 */
import { getRouterExecutionMode, isPromotedSupplier } from "./routerExecutionMode";

const TRUTHY = new Set(["true", "1", "yes"]);

function parseTruthy(raw: string | undefined): boolean {
  if (!raw) return false;
  return TRUTHY.has(raw.trim().toLowerCase());
}

export function isPromotedOrchestratorRoutingDisabled(): boolean {
  return parseTruthy(
    process.env.FINGERPRINT_PROMOTED_ORCHESTRATOR_ROUTING_DISABLED
  );
}

export function isApiPrewarmOrchestratorRoutingDisabled(): boolean {
  return (
    isPromotedOrchestratorRoutingDisabled() ||
    parseTruthy(process.env.FINGERPRINT_API_ORCHESTRATOR_CONVERGENCE_DISABLED)
  );
}

export function isStorefrontOrchestratorRoutingDisabled(): boolean {
  return (
    isPromotedOrchestratorRoutingDisabled() ||
    parseTruthy(
      process.env.FINGERPRINT_STOREFRONT_ORCHESTRATOR_CONVERGENCE_DISABLED
    )
  );
}

/**
 * Core rule: promoted mode + promotion registry → orchestrator-first everywhere.
 */
export function isPromotedOrchestratorFirst(supplierId: string): boolean {
  if (isPromotedOrchestratorRoutingDisabled()) return false;
  return (
    getRouterExecutionMode() === "promoted" && isPromotedSupplier(supplierId)
  );
}

/** API + prewarm entry points. */
export function isApiPrewarmOrchestratorFirst(supplierId: string): boolean {
  if (isApiPrewarmOrchestratorRoutingDisabled()) return false;
  return isPromotedOrchestratorFirst(supplierId);
}

/** Storefront product retrieval entry point. */
export function isStorefrontOrchestratorFirst(supplierId: string): boolean {
  if (isStorefrontOrchestratorRoutingDisabled()) return false;
  return isPromotedOrchestratorFirst(supplierId);
}
