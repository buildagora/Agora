const TRUTHY = new Set(["true", "1", "yes"]);

function parseTruthy(raw: string | undefined): boolean {
  if (!raw) return false;
  return TRUTHY.has(raw.trim().toLowerCase());
}

/**
 * Phase 1A: shadow compare logging without changing results.
 */
export function isFingerprintRouterShadowEnabled(): boolean {
  return parseTruthy(process.env.FINGERPRINT_ROUTER_SHADOW);
}

/**
 * Phase 1B: allow router execution for allowlisted suppliers.
 */
export function isFingerprintRouterEnabled(): boolean {
  return parseTruthy(process.env.FINGERPRINT_ROUTER_ENABLED);
}

export function isFingerprintRouterActive(): boolean {
  return isFingerprintRouterShadowEnabled() || isFingerprintRouterEnabled();
}

export function getFingerprintRouterAllowlist(): Set<string> {
  const raw = process.env.FINGERPRINT_ROUTER_SUPPLIER_ALLOWLIST?.trim();
  if (!raw) return new Set();
  return new Set(
    raw
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean)
  );
}

export function isSupplierAllowlisted(supplierId: string): boolean {
  return getFingerprintRouterAllowlist().has(supplierId);
}

export function getFingerprintRouterExecutionTimeoutMs(): number {
  const raw = process.env.FINGERPRINT_ROUTER_EXECUTION_TIMEOUT_MS?.trim();
  const parsed = raw ? Number(raw) : NaN;
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }
  return 8000;
}
