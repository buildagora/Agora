import {
  isFingerprintRouterEnabled,
  isFingerprintRouterShadowEnabled,
} from "./routerFlags";

export type SupplierPromotionState = "promoted" | "not_promoted";
/** Phase 8A control plane — describes rollout stage. */
export type RouterExecutionMode =
  | "off"
  | "shadow"
  | "allowlist"
  | "promoted"
  | "full";

const VALID_MODES = new Set<RouterExecutionMode>([
  "off",
  "shadow",
  "allowlist",
  "promoted",
  "full",
]);

function parseExplicitMode(raw: string | undefined): RouterExecutionMode | null {
  if (!raw?.trim()) return null;
  const normalized = raw.trim().toLowerCase() as RouterExecutionMode;
  return VALID_MODES.has(normalized) ? normalized : null;
}

/**
 * Resolve router execution mode from env.
 *
 * Explicit: `FINGERPRINT_ROUTER_EXECUTION_MODE`
 *
 * Legacy fallback (unchanged behavior):
 * - both flags off → off
 * - shadow only → shadow
 * - enabled → allowlist (supplier gate still uses FINGERPRINT_ROUTER_SUPPLIER_ALLOWLIST)
 */
export function getRouterExecutionMode(): RouterExecutionMode {
  const explicit = parseExplicitMode(
    process.env.FINGERPRINT_ROUTER_EXECUTION_MODE
  );
  if (explicit) return explicit;

  const shadow = isFingerprintRouterShadowEnabled();
  const enabled = isFingerprintRouterEnabled();

  if (!shadow && !enabled) return "off";
  if (shadow && !enabled) return "shadow";
  if (enabled) return "allowlist";
  return "off";
}

export function getPromotedSupplierIds(): Set<string> {
  const raw = process.env.FINGERPRINT_ROUTER_PROMOTED_SUPPLIERS?.trim();
  if (!raw) return new Set();
  return new Set(
    raw
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean)
  );
}

/** True when supplier is in the promotion registry and mode is `promoted`. */
export function getSupplierPromotionState(
  supplierId: string
): SupplierPromotionState {
  if (getRouterExecutionMode() === "promoted" && isPromotedSupplier(supplierId)) {
    return "promoted";
  }
  return "not_promoted";
}

/**
 * Phase 8D — promoted suppliers walk the router chain when mode is `promoted`,
 * even if not on the legacy allowlist. Non-promoted suppliers unchanged.
 */
export function isRouterEligibleSupplier(
  supplierId: string,
  allowlisted: boolean
): boolean {
  if (getRouterExecutionMode() === "promoted" && isPromotedSupplier(supplierId)) {
    return true;
  }
  return allowlisted;
}

/** Phase 8D — promotion registry; routing behavior activates in promoted mode. */
export function isPromotedSupplier(supplierId: string): boolean {
  return getPromotedSupplierIds().has(supplierId);
}
