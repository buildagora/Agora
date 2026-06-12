# Phase 1B — Fallback-chain router execution

Phase 1B wires the fingerprint router into **`searchSupplierDiscoveryForSupplier`** with optional allowlisted execution. Legacy discovery remains the emergency fallback during migration.

## Architecture

```
Fingerprint → StrategyPlan → Chain execution → Legacy (if exhausted)
                  ↓
         primaryStrategy + fallbackChain + fullOrderedChain
```

## Phase 1B.1 recap (single-strategy proof)

Phase 1B.1 proved the control plane with one executor:

- `FINGERPRINT_ROUTER_ENABLED` + allowlist
- Router attempted **only** when `primaryStrategy === SERP_SITE_ORGANIC`
- Any failure → immediate legacy fallback
- Same underlying `searchSupplierSite` executor as legacy

**Superseded by 1B.2** for allowlisted suppliers — see fallback-chain behavior below.

## Phase 1B.2 fallback-chain behavior

The router now returns a **StrategyPlan**:

| Field | Meaning |
|-------|---------|
| `primaryStrategy` | Best learned strategy for this supplier |
| `fallbackChain` | Remaining viable strategies after primary |
| `fullOrderedChain` | `[primary, ...fallbackChain]` — always ends with `PROBABILISTIC_CATEGORY_PROFILE` |

When router execution is allowed, the orchestrator **walks `fullOrderedChain` in order**:

1. Attempt strategy via `executeExtractionStrategy()`
2. **Stop** on first **non-empty** success
3. **Continue** on `empty`, `unsupported`, `error`, or `timeout`
4. If all strategies fail → **legacy emergency fallback** (migration only)

### Success definition (intentionally simple)

**Success = non-empty results.** Product-quality thresholds (relevance scoring, minimum field coverage, dedupe quality, etc.) are **deferred** to a later phase.

### Executable strategies (Phase 1B.2)

| Strategy | Status |
|----------|--------|
| `SERP_SITE_ORGANIC` | **Executable** — uses `searchSupplierSite()` |
| All others | Return `unsupported` quickly (no I/O) |
| `PROBABILISTIC_CATEGORY_PROFILE` | **Terminal in plan, not wired** — returns `unsupported`; no invented capability/product results yet |

### Migration guards (skip chain, go to legacy)

- `FINGERPRINT_ROUTER_ENABLED=false` (and shadow off → pure legacy, no logs)
- Supplier not in `FINGERPRINT_ROUTER_SUPPLIER_ALLOWLIST`
- Fingerprint missing
- Shadow compare `matchStatus=INVESTIGATE`

### Not modified in Phase 1B

- API route, storefront, prewarm, registry configs, adapters
- Legacy discovery body (`legacySupplierDiscoveryForSupplier`)

---

## Enable locally

In `.env.local`:

```bash
FINGERPRINT_ROUTER_SHADOW=true
FINGERPRINT_ROUTER_ENABLED=true
FINGERPRINT_ROUTER_SUPPLIER_ALLOWLIST=ferguson_plumbing_hsv
# optional — default 8000ms per strategy attempt
FINGERPRINT_ROUTER_EXECUTION_TIMEOUT_MS=8000
```

| Flag | Effect |
|------|--------|
| Both off | Pure legacy — no DB, no telemetry |
| `SHADOW=true`, `ENABLED=false` | Plan + compare telemetry; legacy returns |
| `ENABLED=true` + allowlist | Walk chain for allowlisted suppliers |

**Prerequisite:** fingerprints backfilled:

```bash
npm run fingerprint:backfill
```

Use supplier IDs that exist in your local DB (check with `npx tsx scripts/fingerprint/validate-phase1b2-chain.ts` or query `SupplierFingerprint`).

---

## Local testing

### Validation script (recommended)

```bash
npm run fingerprint:backfill
npm run fingerprint:validate-chain
```

Runs three scenarios:

- **A.** Allowlisted SERP-primary supplier
- **B.** Same supplier not allowlisted
- **C.** Platform-primary supplier with Serp in chain (simulated via allowlist + facts)

### Manual discovery call

```bash
FINGERPRINT_ROUTER_SHADOW=true \
FINGERPRINT_ROUTER_ENABLED=true \
FINGERPRINT_ROUTER_SUPPLIER_ALLOWLIST=ferguson_plumbing_hsv \
npx tsx -e "
import { config } from 'dotenv';
config({ path: '.env.local' });
process.env.FINGERPRINT_ROUTER_SHADOW = 'true';
process.env.FINGERPRINT_ROUTER_ENABLED = 'true';
process.env.FINGERPRINT_ROUTER_SUPPLIER_ALLOWLIST = 'ferguson_plumbing_hsv';
const { searchSupplierDiscoveryForSupplier } = await import('./src/lib/suppliers/resolveSupplierDiscovery');
const results = await searchSupplierDiscoveryForSupplier('ferguson_plumbing_hsv', 'copper pipe', 'ferguson.com');
console.log('RESULT_COUNT', results.length);
"
```

Look for stdout JSON lines with `"event":"supplier_extraction_route"`.

---

## How to read telemetry

Event: `supplier_extraction_route`

| Field | When present | Meaning |
|-------|--------------|---------|
| `executionPath` | Always | `router` = chain succeeded; `legacy_fallback` = chain skipped or exhausted; `legacy` = shadow-only or router disabled |
| `primaryStrategy` | When fingerprint loaded | Router's best strategy |
| `fallbackChain` | When fingerprint loaded | Planned fallbacks after primary |
| `fullOrderedChain` | When fingerprint loaded | Full walk order |
| `attemptedStrategies` | When chain ran | Per-attempt status, reason, latency |
| `finalStrategyUsed` | Router success | Which strategy returned results |
| `fallbackDepth` | When chain ran | `0` = primary succeeded; `>0` = fallback index |
| `fallbackReason` | Legacy fallback | e.g. `chain_exhausted`, `not_allowlisted`, `investigate_mismatch` |
| `routerExecutionAttempted` | Always | `true` if chain walker ran |
| `matchStatus` | When fingerprint loaded | Shadow compare vs legacy label |

### Example: allowlisted Serp chain success

```json
{
  "event": "supplier_extraction_route",
  "supplierId": "ferguson_plumbing_hsv",
  "executionPath": "router",
  "primaryStrategy": "SERP_SITE_ORGANIC",
  "fullOrderedChain": ["SERP_SITE_ORGANIC", "PROBABILISTIC_CATEGORY_PROFILE"],
  "attemptedStrategies": [
    { "strategy": "SERP_SITE_ORGANIC", "status": "success", "resultCount": 12, "latencyMs": 842 }
  ],
  "finalStrategyUsed": "SERP_SITE_ORGANIC",
  "fallbackDepth": 0,
  "routerExecutionAttempted": true,
  "resultCountRouter": 12
}
```

### Example: chain exhausted → legacy

```json
{
  "executionPath": "legacy_fallback",
  "fallbackReason": "chain_exhausted",
  "attemptedStrategies": [
    { "strategy": "SERP_SITE_ORGANIC", "status": "empty", "reason": "empty_results" },
    { "strategy": "PROBABILISTIC_CATEGORY_PROFILE", "status": "unsupported", "reason": "capability_executor_not_wired" }
  ],
  "resultCountLegacy": 12
}
```

### Example: unsupported primary → Serp fallback

```json
{
  "executionPath": "router",
  "primaryStrategy": "PLATFORM_API",
  "attemptedStrategies": [
    { "strategy": "PLATFORM_API", "status": "unsupported", "reason": "strategy_platform_api" },
    { "strategy": "SERP_SITE_ORGANIC", "status": "success", "resultCount": 8, "latencyMs": 901 }
  ],
  "finalStrategyUsed": "SERP_SITE_ORGANIC",
  "fallbackDepth": 1
}
```

---

## Rollback

Instant rollback — no code deploy required:

```bash
# .env.local
FINGERPRINT_ROUTER_ENABLED=false
FINGERPRINT_ROUTER_SHADOW=false
```

Or remove the allowlist entry while keeping shadow on for compare-only logging:

```bash
FINGERPRINT_ROUTER_ENABLED=false
FINGERPRINT_ROUTER_SHADOW=true
FINGERPRINT_ROUTER_SUPPLIER_ALLOWLIST=
```

Behavior reverts to pure legacy discovery with no chain execution.

---

## Tests

```bash
npx tsc --noEmit
npx tsx src/lib/suppliers/routing/__tests__/routerFlags.test.ts
npx tsx src/lib/suppliers/routing/__tests__/routerTelemetry.test.ts
npx tsx src/lib/suppliers/routing/__tests__/resolveExtractionStrategy.test.ts
npx tsx src/lib/suppliers/routing/__tests__/executeExtractionStrategy.test.ts
npx tsx src/lib/suppliers/routing/__tests__/executeExtractionStrategyChain.test.ts
npx tsx src/lib/suppliers/routing/__tests__/resolveSupplierExtractionExecution.test.ts
npx tsx src/lib/suppliers/routing/__tests__/resolveSupplierExtractionShadow.test.ts
npx tsx src/lib/suppliers/routing/__tests__/shadowCompare.test.ts
npx tsx src/lib/suppliers/routing/__tests__/resolveLegacyStrategy.test.ts
```

---

## Out of scope (next phases)

- New executors: `PLATFORM_API`, `PUBLIC_API`, `SERP_PRODUCT_ENGINE`, `SCHEMA_OR_SITEMAP`, `HTML_SCRAPE`, `PLAYWRIGHT`, `ANTI_BOT_EVALUATION`
- Wiring `PROBABILISTIC_CATEGORY_PROFILE` capability results
- Product-quality success thresholds
- Removing legacy discovery
- Storefront / API / prewarm integration
