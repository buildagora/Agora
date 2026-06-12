# Router execution modes (Phase 8A)

Phase 8A introduces the **execution mode control plane** and observability fields for the supplier extraction router migration. **No routing, ranking, or eligibility behavior changes** in this phase.

## Target architecture

```
Request
  ↓
SupplierExtractionOrchestrator  (runSupplierDiscoveryRouting)
  ↓
Executors
  ├─ Platform API
  ├─ Schema / Sitemap
  ├─ HTML
  ├─ Adapter (legacy Serp/product-engine)
  ├─ Serp
  └─ Profile
```

Execution mode is the **control plane** for rolling out orchestrator-first behavior in later phases.

## Modes

| Mode | Env | Behavior today (Phase 8A) |
|------|-----|---------------------------|
| **off** | Default when all router flags unset | Pure legacy discovery; no router telemetry on early exit |
| **shadow** | `FINGERPRINT_ROUTER_SHADOW=true`, `ENABLED` unset/false | Plan + compare logged; legacy returns results |
| **allowlist** | `FINGERPRINT_ROUTER_ENABLED=true` (+ optional allowlist) | Router executes for allowlisted suppliers; legacy fallback on exhaustion |
| **promoted** | `FINGERPRINT_ROUTER_EXECUTION_MODE=promoted` + `FINGERPRINT_ROUTER_PROMOTED_SUPPLIERS` | Phase 8C cohort suppliers get promotion semantics (Phase 8D) |
| **full** | `FINGERPRINT_ROUTER_EXECUTION_MODE=full` | **Not enabled** — reserved for global rollout |

### Explicit mode (recommended going forward)

```bash
FINGERPRINT_ROUTER_EXECUTION_MODE=off|shadow|allowlist|promoted|full
```

When unset, mode is **derived from legacy flags** so existing deployments keep working:

- `SHADOW=false`, `ENABLED=false` → **off**
- `SHADOW=true`, `ENABLED=false` → **shadow**
- `ENABLED=true` → **allowlist**

> **Current production behavior is preserved and represented by allowlist mode** when `FINGERPRINT_ROUTER_ENABLED=true` and suppliers are listed in `FINGERPRINT_ROUTER_SUPPLIER_ALLOWLIST`.

## Promotion registry (Phase 8A — infrastructure only)

```bash
FINGERPRINT_ROUTER_PROMOTED_SUPPLIERS=floor_decor_hsv,johnstone_hsv,wittichen_hsv,abc_supply_hsv,gulfeagle_hsv,trane_supply_hsv,re_michel_hsv,ll_flooring_hsv,cmn90dbjr000404ldzhcsquav,lennox_hsv,siteone_hsv,siteone_north_hsv,ppg_paint_hsv,ferguson_plumbing_hsv
```

Helper: `isPromotedSupplier(supplierId)` — gates orchestrator-first routing when mode is `promoted`.

Legacy allowlist (unchanged):

```bash
FINGERPRINT_ROUTER_SUPPLIER_ALLOWLIST=johnstone_hsv,floor_decor_hsv,...
```

## Telemetry

### Route events (`supplier_extraction_route`)

Existing orchestrator logs now include:

| Field | Description |
|-------|-------------|
| `executionMode` | Control plane mode at observation time |
| `entryPoint` | Request origin |
| `executionPath` | `router` \| `legacy` \| `legacy_fallback` |

### Observation events (`supplier_extraction_observation`)

Emitted when adapter-first logic bypasses the orchestrator:

| Field | Description |
|-------|-------------|
| `adapterBypass` | Always `true` for bypass observations |
| `entryPoint` | Where bypass occurred |
| `executionPath` | `adapter_bypass` |

### Entry points

| Value | Location |
|-------|----------|
| `search_stage2` | Stage 2 live evidence (`executeSupplierSearch`) |
| `api_product_search` | `GET /api/supplier-product-search` |
| `prewarm` | `runSearch` prewarm cache |
| `storefront` | `fetchSupplierSiteSearchForStorefront` (product_engine path) |
| `supplier_detail` | Storefront capability profile fetch |
| `unknown` | Default when not specified |

### Adapter bypass locations (Phase 8A instrumented)

1. **`src/app/api/supplier-product-search/route.ts`** — `findSupplierSearchAdapter()` before adapter search
2. **`src/lib/search/runSearch.server.ts`** — prewarm adapter branch
3. **`src/lib/search/storefront/fetchSupplierSiteSearchForStorefront.server.ts`** — `product_engine` strategy

Other registry lookups (e.g. `resolveSupplierProductSource`) are label-only and do not execute extraction.

## Cross-path observability

Utilities: `src/lib/suppliers/routing/crossPathExtractionObservability.ts`

Report script:

```bash
npm run fingerprint:cross-path-report -- path/to/app.log
```

Compares `supplierId` + `query` across entry points before any promotion work.

## Related env vars (unchanged)

```bash
FINGERPRINT_ROUTER_SHADOW=true
FINGERPRINT_ROUTER_ENABLED=true
FINGERPRINT_ROUTER_SUPPLIER_ALLOWLIST=...
FINGERPRINT_ROUTER_EXECUTION_TIMEOUT_MS=8000
```

## Phase roadmap

| Phase | Focus |
|-------|--------|
| **8A** | Mode enum, promotion helper, telemetry, bypass detection |
| **8B** | Cross-path parity analysis (read-only) |
| **8C.1** | API + prewarm orchestrator convergence (retired — see 8E.0) |
| **8C.2** | Storefront orchestrator convergence (retired — see 8E.0) |
| **8D** | Promoted mode rollout (Wave 1 + Wave 2) |
| **8E.0** | Rollout infrastructure generalization |
| **8E+** | Scalable domain-supplier promotion batches |

> **Phase 8C cohort gates removed in 8E.0.** Orchestrator-first on API, prewarm, and storefront is controlled solely by `executionMode=promoted` + `FINGERPRINT_ROUTER_PROMOTED_SUPPLIERS` via `promotedOrchestratorRouting.ts`.

## Phase 8D.1 — Promoted mode rollout (Wave 1)

Wave 1 promoted suppliers (orchestrator-primary when mode is `promoted`):

```bash
FINGERPRINT_ROUTER_EXECUTION_MODE=promoted
FINGERPRINT_ROUTER_ENABLED=true
FINGERPRINT_ROUTER_PROMOTED_SUPPLIERS=floor_decor_hsv,johnstone_hsv,wittichen_hsv,abc_supply_hsv
```

**Wave 1:** `floor_decor_hsv`, `johnstone_hsv`  
**Wave 2:** `wittichen_hsv`, `abc_supply_hsv` (completed in Phase 8D.2)

### Behavior in `promoted` mode

| Supplier | Router eligibility | Orchestrator-first (API/prewarm/storefront) |
|----------|-------------------|---------------------------------------------|
| Promoted registry | Yes (even without allowlist) | Yes (all converged entry points) |
| Allowlisted non-promoted | Yes (unchanged) | Legacy entry paths (adapter/strategy first) |
| Other suppliers | Legacy / not allowlisted | Unchanged |

Promoted mode is **not** full mode — only registry suppliers get promotion semantics.

### Telemetry

Route and observation events include:

- `executionMode=promoted`
- `supplierPromotionState=promoted` | `not_promoted`

### Rollback (no code deploy required)

```bash
# Revert to allowlist control plane
FINGERPRINT_ROUTER_EXECUTION_MODE=allowlist

# Clear promotion registry
FINGERPRINT_ROUTER_PROMOTED_SUPPLIERS=

# Revert convergence paths (if needed)
FINGERPRINT_API_ORCHESTRATOR_CONVERGENCE_DISABLED=true
FINGERPRINT_STOREFRONT_ORCHESTRATOR_CONVERGENCE_DISABLED=true
```

**Verify:** `npm run fingerprint:phase8b-parity` with promoted env — Wave 1 suppliers show `supplierPromotionState=promoted`; Wave 2 candidates show `not_promoted`.

## Phase 8D.2 — Promoted mode rollout (Wave 2)

Completes promotion for the Phase 8C cohort:

```bash
FINGERPRINT_ROUTER_EXECUTION_MODE=promoted
FINGERPRINT_ROUTER_ENABLED=true
FINGERPRINT_ROUTER_PROMOTED_SUPPLIERS=floor_decor_hsv,johnstone_hsv,wittichen_hsv,abc_supply_hsv
```

**Full Phase 8C cohort (all promoted):**

- `floor_decor_hsv` (Wave 1)
- `johnstone_hsv` (Wave 1)
- `wittichen_hsv` (Wave 2)
- `abc_supply_hsv` (Wave 2)

After Wave 2, all cohort suppliers should show `supplierPromotionState=promoted` across Search, API, Prewarm, and Storefront while `executionMode=promoted`.

### Wave 2 rollback (partial)

To revert Wave 2 only while keeping Wave 1:

```bash
FINGERPRINT_ROUTER_PROMOTED_SUPPLIERS=floor_decor_hsv,johnstone_hsv
```

Full rollback remains the same as Phase 8D.1 (clear registry or set `executionMode=allowlist`).

**Verify:** `npm run fingerprint:phase8b-parity` — all four cohort suppliers show `supplierPromotionState=promoted`; PASS=10, adapter_bypass=0.

## Phase 8E.0 — Rollout infrastructure generalization

Unified control plane in `src/lib/suppliers/routing/promotedOrchestratorRouting.ts`.

**Orchestrator-first rule (API, prewarm, storefront):**

```text
executionMode = promoted
AND isPromotedSupplier(supplierId)
AND kill-switch not set
→ searchSupplierDiscoveryForSupplier() first
```

No hardcoded supplier cohorts. Adding a supplier to `FINGERPRINT_ROUTER_PROMOTED_SUPPLIERS` is sufficient for orchestrator control on all converged entry points.

### Rollback

```bash
# Primary rollback (no cohort code dependency)
FINGERPRINT_ROUTER_EXECUTION_MODE=allowlist
FINGERPRINT_ROUTER_PROMOTED_SUPPLIERS=

# Optional emergency kill switches
FINGERPRINT_PROMOTED_ORCHESTRATOR_ROUTING_DISABLED=true
FINGERPRINT_API_ORCHESTRATOR_CONVERGENCE_DISABLED=true
FINGERPRINT_STOREFRONT_ORCHESTRATOR_CONVERGENCE_DISABLED=true
```

### Readiness foundation

```bash
npm run fingerprint:supplier-readiness
```

Outputs per-supplier: `domainPresent`, `coordinatesPresent`, `fingerprintStatus`, `promotionState`.

## Phase 8E.1 — Proven-v1 completion rollout

All proven-v1 suppliers promoted via registry only (no new routing code):

```bash
FINGERPRINT_ROUTER_EXECUTION_MODE=promoted
FINGERPRINT_ROUTER_ENABLED=true
FINGERPRINT_ROUTER_PROMOTED_SUPPLIERS=floor_decor_hsv,johnstone_hsv,wittichen_hsv,abc_supply_hsv,gulfeagle_hsv,trane_supply_hsv,re_michel_hsv,ll_flooring_hsv,cmn90dbjr000404ldzhcsquav,lennox_hsv,siteone_hsv,siteone_north_hsv,ppg_paint_hsv,ferguson_plumbing_hsv
```

**Proven-v1 cohort (all promoted):**

- `floor_decor_hsv`
- `johnstone_hsv`
- `wittichen_hsv`
- `abc_supply_hsv`
- `gulfeagle_hsv` (Phase 8E.1)
- `trane_supply_hsv` (Phase 8E.1)
- `re_michel_hsv` (Phase 8E.1)

**Verify:**

```bash
npm run fingerprint:phase8b-parity    # PASS=18, adapter_bypass=0
npm run fingerprint:phase8d1-search
npm run fingerprint:supplier-readiness
```

Rollback remains env-only — clear registry or set `executionMode=allowlist`.

## Phase 8E.2d — Platform API cohort promotion

Five platform API suppliers promoted via registry only (12 total):

```bash
FINGERPRINT_ROUTER_EXECUTION_MODE=promoted
FINGERPRINT_ROUTER_ENABLED=true
FINGERPRINT_ROUTER_PROMOTED_SUPPLIERS=floor_decor_hsv,johnstone_hsv,wittichen_hsv,abc_supply_hsv,gulfeagle_hsv,trane_supply_hsv,re_michel_hsv,ll_flooring_hsv,cmn90dbjr000404ldzhcsquav,lennox_hsv,siteone_hsv,siteone_north_hsv,ppg_paint_hsv,ferguson_plumbing_hsv
```

**Platform API cohort (Phase 8E.2d):**

- `ll_flooring_hsv` (Shopify PUBLIC_API)
- `cmn90dbjr000404ldzhcsquav` (QXO Constructor PLATFORM_API)
- `lennox_hsv` (Hybris PLATFORM_API)
- `siteone_hsv` (Hybris PLATFORM_API)
- `siteone_north_hsv` (Hybris PLATFORM_API)

Canonical registry mirror: `ROUTER_PROMOTED_SUPPLIERS` in `scripts/fingerprint/phase6bProvenCohortParity.ts`.

**Verify:**

```bash
npm run fingerprint:phase8b-parity
npm run fingerprint:phase8e2-platform-cohort-validation
npm run fingerprint:phase8d1-search
npm run fingerprint:supplier-readiness   # promotionStatePromoted: 12
```

## Phase 8F.3 — PPG + Ferguson Plumbing promotion

Two suppliers promoted via registry only (14 total):

```bash
FINGERPRINT_ROUTER_EXECUTION_MODE=promoted
FINGERPRINT_ROUTER_ENABLED=true
FINGERPRINT_ROUTER_PROMOTED_SUPPLIERS=floor_decor_hsv,johnstone_hsv,wittichen_hsv,abc_supply_hsv,gulfeagle_hsv,trane_supply_hsv,re_michel_hsv,ll_flooring_hsv,cmn90dbjr000404ldzhcsquav,lennox_hsv,siteone_hsv,siteone_north_hsv,ppg_paint_hsv,ferguson_plumbing_hsv
```

**Phase 8F.3 cohort:**

- `ppg_paint_hsv` (Algolia PUBLIC_API)
- `ferguson_plumbing_hsv` (SCHEMA_OR_SITEMAP)

**Verify:**

```bash
npm run fingerprint:phase8f3-promotion
npm run fingerprint:phase8b-parity
npm run fingerprint:supplier-readiness   # promotionStatePromoted: 14
```

## Phase 9.1 — Full domain supplier router adoption

All 120 domain-bearing suppliers promoted via registry only (14 → 120):

```bash
FINGERPRINT_ROUTER_EXECUTION_MODE=promoted
FINGERPRINT_ROUTER_ENABLED=true
FINGERPRINT_ROUTER_PROMOTED_SUPPLIERS=<see DOMAIN_SUPPLIER_COHORT in scripts/fingerprint/phase6bProvenCohortParity.ts>
```

Canonical registry mirror: `DOMAIN_SUPPLIER_COHORT` / `ROUTER_PROMOTED_SUPPLIERS` in `scripts/fingerprint/phase6bProvenCohortParity.ts`.

**Verify:**

```bash
npm run fingerprint:phase9.1-validation
npm run fingerprint:phase8b-parity
npm run fingerprint:supplier-readiness   # promotionStatePromoted: 120
```

Rollback: clear `FINGERPRINT_ROUTER_PROMOTED_SUPPLIERS` or remove supplier IDs — no code deploy required.
