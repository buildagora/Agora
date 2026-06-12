# Phase 0 — Supplier fingerprinting engineering notes

## Architecture

```
Fingerprint engine (backfill) → facts in SupplierFingerprint
Router (resolveExtractionStrategy) → chosenStrategy in memory / reports only
Legacy resolver (resolveLegacyStrategy) → shadow baseline label only
```

## Facts vs decisions (Option B)

- **`SupplierFingerprint` stores facts only** — platform detection, access status, demand, `allowSerpFallback`, `legacySnapshot`, etc.
- **`chosenStrategy` is not a database column.** `resolveExtractionStrategy()` derives strategy from facts whenever needed (shadow CLI, tests, future Phase 1 flag).
- The fingerprint engine must **never** assign final strategy; only the router does, and only outside the DB in Phase 0.

## Strategy tiers

| Tier | Strategies |
|------|------------|
| 1 | `PLATFORM_API`, `PUBLIC_API` |
| 2 | `SCHEMA_OR_SITEMAP`, `HTML_SCRAPE` |
| 3 | `PLAYWRIGHT`, `ANTI_BOT_EVALUATION` |
| 4 | `SERP_PRODUCT_ENGINE`, `SERP_SITE_ORGANIC` |
| 5 | `PROBABILISTIC_CATEGORY_PROFILE` |

**SERP is Tier 4 fallback only** — it must not outrank direct extraction when tiers 1–3 are viable.

## Platform detection ≠ platform access

- `detectedPlatform` records what stack the site appears to use (from legacy config).
- `platformAccessStatus` records whether Agora can use it (`ACCESSIBLE`, `PUBLIC_ANONYMOUS`, `BINDING_INCOMPLETE`, `REQUIRES_AUTH`, etc.).
- Router **must not** choose `PLATFORM_API` from detection alone; it requires accessible bindings per router rules.

## Production wiring

**No production search paths import** `src/lib/suppliers/fingerprint/*` or `src/lib/suppliers/routing/*` in Phase 0. Existing behavior remains:

- `resolveSupplierDiscovery.ts`
- `searchSupplierSite.ts` / Serp
- `executePlatformCatalogSearch.ts`
- Supplier product search API and storefront fetch

## Shadow gate (Phase 0)

Expect **100% `EXACT_MATCH`** for legacy-mirror cohorts where facts match production intent (e.g. `site_organic`, `product_engine`, generic domain with `allowSerpFallback`). Document **`EXPECTED_FUTURE`** where the router intentionally diverges (blocked Bloomreach/Coveo platform labels vs legacy `PLATFORM_API`).

## CLI entrypoints

See [scripts/fingerprint/README.md](../../scripts/fingerprint/README.md).
