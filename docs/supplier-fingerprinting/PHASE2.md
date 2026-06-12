# Phase 2 — Platform executor rollout

Phase 2 wires top-of-chain executors using **existing** legacy platform infrastructure. No new platform adapters or scraping.

## Phase 2A — PLATFORM_API (Johnstone / SLI)

First cohort: **Johnstone Supply** via registry prefix `johnstone_*` (e.g. `johnstone_hsv`).

### Target chain (Johnstone)

```
PLATFORM_API
  ↓ success → router results (no legacy)

PLATFORM_API
  ↓ empty / error / unsupported
PROBABILISTIC_CATEGORY_PROFILE
  ↓ empty / error
legacy emergency fallback (once, after chain exhausted)
```

Johnstone fingerprints set `allowSerpFallback=false`, so `SERP_SITE_ORGANIC` is not in the chain.

### Bridge module

`src/lib/suppliers/routing/resolvePlatformCatalogExecution.ts`

- Resolves registry prefix config from `supplierSiteSearchConfig.ts` (Johnstone → SLI)
- Optionally resolves domain platform config from `supplierDomainPlatformConfig.ts` (future cohorts)
- Returns params for `executePlatformCatalogSearch`, or `null`

### Executor wiring

`executeExtractionStrategy.ts` — `PLATFORM_API` branch:

1. Guard: `isPlatformApiExecutionAllowed(facts)` — requires `ACCESSIBLE`, not `UNKNOWN`, not blocked statuses
2. Resolve platform config; missing → `unsupported`
3. Call existing `executePlatformCatalogSearch`
4. Non-empty → `success`; empty → `empty`; throw → `error`

**Not in scope for 2A:** `PUBLIC_API`, new platform modules, legacy routing map changes.

### Guards (PLATFORM_API must not run)

| Condition | Result |
|-----------|--------|
| `BINDING_INCOMPLETE` | unsupported |
| `REQUIRES_AUTH` | unsupported |
| `REQUIRES_CONTRACT` | unsupported |
| `BLOCKED` | unsupported |
| `UNKNOWN` platform | unsupported |
| Missing config | unsupported |

### Enable locally

```bash
npm run fingerprint:backfill
FINGERPRINT_ROUTER_ENABLED=true
FINGERPRINT_ROUTER_SUPPLIER_ALLOWLIST=johnstone_hsv
```

Validate with `searchSupplierDiscoveryForSupplier("johnstone_hsv", "<query>", "johnstonesupply.com")`.

Expected telemetry on success:

- `executionPath=router`
- `primaryStrategy=PLATFORM_API`
- `finalStrategyUsed=PLATFORM_API`
- `fallbackDepth=0`
- `attemptedStrategies` includes `PLATFORM_API` success
- legacy not called

### Phase 2B — PUBLIC_API (Floor & Decor / Algolia)

Second cohort: **Floor & Decor** via domain platform `flooranddecor.com` (e.g. `floor_decor_hsv`).

**Prerequisite:** `buildFactsFromLegacy` enriches `PUBLIC_ANONYMOUS` platforms with `hasPublicApi=true` and `publicApiAccessStatus=ACCESSIBLE`.

### Target chain (Floor & Decor)

```
PUBLIC_API
  ↓ success → router results (no legacy)

PUBLIC_API
  ↓ empty / error / unsupported
PROBABILISTIC_CATEGORY_PROFILE
  ↓ empty / error
legacy emergency fallback (once, after chain exhausted)
```

### Executor wiring

`executeExtractionStrategy.ts` — `PUBLIC_API` branch:

1. Guard: `isPublicApiExecutionAllowed(facts)` — `ACCESSIBLE` or `PUBLIC_ANONYMOUS`, not blocked
2. Resolve platform config via `resolvePlatformCatalogExecution`
3. Call existing `executePlatformCatalogSearch` → Algolia path
4. Non-empty → `success`; empty → `empty`; throw → `error`

### Enable locally

```bash
npm run fingerprint:backfill
FINGERPRINT_ROUTER_ENABLED=true
FINGERPRINT_ROUTER_SUPPLIER_ALLOWLIST=floor_decor_hsv
```

Validate with `searchSupplierDiscoveryForSupplier("floor_decor_hsv", "<query>", "flooranddecor.com")`.

Expected telemetry on success:

- `executionPath=router`
- `primaryStrategy=PUBLIC_API`
- `finalStrategyUsed=PUBLIC_API`
- `fallbackDepth=0`
- `attemptedStrategies` includes `PUBLIC_API` success
- legacy not called

See also: [Phase 1C — Capability profile terminal fallback](./PHASE1C.md)
