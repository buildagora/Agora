# Phase 1C — Capability profile terminal fallback

Phase 1C wires `PROBABILISTIC_CATEGORY_PROFILE` as the terminal chain executor using existing `SupplierCapability` infrastructure. Capability profile is a **low-confidence, non-inventory fallback** — it must never look like live product search results.

## Target chain behavior

```
SERP success (non-empty)
  → profile not executed

SERP empty
  → PROBABILISTIC_CATEGORY_PROFILE executes
  → if capability matches exist → router success (no legacy)
  → if profile empty → chain exhausted → legacy fallback once
```

## Commit 2 — UI/API labeling safeguards

Commit 2 ensures capability profile rows are never presented as live product listings.

### Storefront sections

| Section | Contents |
|---------|----------|
| `sections.products` | Live inventory / catalog rows only |
| `sections.capabilityProfiles` | Inferred capability profile rows only |

Profile rows are populated from `searchSupplierDiscoveryForSupplier` when **`FINGERPRINT_ROUTER_ENABLED=true`** and the supplier is allowlisted. When router flags are off, `capabilityProfiles` is always `[]` — no behavior change.

### Detection

Use `isCapabilityProfileResult()` from `src/lib/suppliers/capability/profileResultContract.ts` as the **sole** detection gate. Do not duplicate profile detection logic elsewhere.

### UI components

| Component | Role |
|-----------|------|
| `CapabilityProfileSection.tsx` | Dedicated labeled section — badge, disclaimer, evidence CTA |
| `ProductSection.tsx` | Live products only — unchanged labeling path |

Profile cards:

- Badge: **Likely carries**
- Disclaimer: *Based on supplier capability data, not live inventory.*
- Price: hidden
- Inventory: hidden
- Image: no product image placeholder
- CTA: **View supplier evidence** (external `productUrl`) or **Contact supplier** (`tel:`)

Profile rows never appear in `ExactListingFocus`, `automatedProduct`, or `sections.products`.

### API consumer guide

`GET /api/supplier-product-search` returns unchanged `SupplierProductResult` fields plus additive metadata:

```json
{
  "supplierId": "abc_supply_hsv",
  "source": "ABC_SUPPLY",
  "results": [
    {
      "title": "Likely carries: Atlas — Asphalt Shingles",
      "price": null,
      "rankingSignals": ["capability_profile", "inferred_match", "no_live_inventory"],
      "resultKind": "capability_profile"
    }
  ],
  "resultSummary": {
    "live": 0,
    "capabilityProfile": 1
  }
}
```

Treat `resultKind === "capability_profile"` or `rankingSignals.includes("capability_profile")` as non-inventory. Never display price for profile rows.

## Commit 1 scope

| In scope | Out of scope (later commits) |
|----------|------------------------------|
| Capability profile executor | Storefront / ProductSection UI labeling |
| Result mapping contract | Allowlist expansion |
| Chain integration via `executeExtractionStrategy` | Platform / PUBLIC API executors |
| Profile attempt telemetry | Schema / HTML / Playwright executors |
| Unit + routing tests | Router planning changes |

## Modules

| File | Role |
|------|------|
| `searchSupplierCapabilityProfile.ts` | Supplier-scoped wrapper over `searchCapabilities()` |
| `mapCapabilityProfileResults.ts` | Maps capability rows → `SupplierProductResult[]` |
| `profileResultContract.ts` | Ranking signals, classification guard |
| `resolveSupplierProductSource.ts` | Source label from registry/domain config |

## Profile result contract

Capability profile rows reuse `SupplierProductResult` for chain/API compatibility with strict non-product rules:

| Field | Value |
|-------|-------|
| `title` | `"Likely carries: …"` prefix |
| `price` | always `null` |
| `imageUrl` | always `null` |
| `classification` | `CATEGORY_PAGE` or `BRAND_PAGE` — never `PRODUCT_PAGE` |
| `rankingSignals` | `capability_profile`, `inferred_match`, `no_live_inventory` |
| `availability` | `"Likely carries"` |
| `productUrl` | capability evidence URL only (no fabricated PDP) |

**Never fabricated:** SKU, inventory counts, pricing, product images.

## Scoring reuse

`searchSupplierCapabilityProfile()` delegates to `searchCapabilities(query, { supplierId })`:

- Reuses existing scoring in `capabilitySearch.ts`
- Threshold: `CAPABILITY_MIN_SCORE` (5)
- Max rows: `CAPABILITY_MAX_ROWS_PER_SUPPLIER` (4)

## Telemetry

When profile executes, `StrategyExecutionAttempt` includes:

- `capabilityMatchCount`
- `capabilityScoreMin`
- `capabilityScoreMax`

Route events record `finalStrategyUsed=PROBABILISTIC_CATEGORY_PROFILE` and `executionPath=router` on profile success.

## Enable locally

Same flags as Phase 1B:

```bash
FINGERPRINT_ROUTER_SHADOW=true
FINGERPRINT_ROUTER_ENABLED=true
FINGERPRINT_ROUTER_SUPPLIER_ALLOWLIST=<supplier_id>
```

Validate:

```bash
npm run fingerprint:validate-chain
```

## Commit 3 preview

Allowlist expansion — see [Phase 2 — Platform executor rollout](./PHASE2.md).
