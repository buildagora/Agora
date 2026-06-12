# Phase 3B — SCHEMA_OR_SITEMAP executor rollout

Phase 3B wires the fingerprint-informed **sitemap-first** executor. Phase 3B.1 is ABC Supply only.

## Phase 3B.1 — ABC Supply (`abc_supply_hsv`)

### Prerequisites

1. Probed fingerprint with `hasSitemap=true` and populated `sitemapUrls`:

```bash
npm run fingerprint:backfill -- --probe --supplier-id abc_supply_hsv
```

2. Router allowlist:

```bash
FINGERPRINT_ROUTER_ENABLED=true
FINGERPRINT_ROUTER_SUPPLIER_ALLOWLIST=abc_supply_hsv
FINGERPRINT_ROUTER_EXECUTION_TIMEOUT_MS=15000
```

### Target chain (ABC)

```
SCHEMA_OR_SITEMAP
  ↓ success → router results (no legacy)

SCHEMA_OR_SITEMAP
  ↓ empty / error / unsupported
SERP_SITE_ORGANIC
  ↓ empty / error
PROBABILISTIC_CATEGORY_PROFILE
  ↓ empty / error
legacy emergency fallback (once, after chain exhausted)
```

### Execution flow

1. Read `sitemapUrls` from fingerprint — **no robots.txt rediscovery**
2. Fetch bounded sitemap sample (max 2 sitemap requests)
3. Parse `<loc>` URLs, rank by query token overlap
4. Fetch up to 10 product pages (3 concurrent)
5. Extract title + URL (optional image/brand); never price
6. Skip pages with `antiBotRisk` HIGH/HARD_BLOCK
7. Return success if ≥1 result meets relevance threshold (0.25)

### Guards

| Condition | Result |
|-----------|--------|
| Supplier not in allowlist | unsupported |
| `hasSitemap=false` and `hasSchemaMarkup=false` | unsupported |
| `hasSitemap=true` but empty `sitemapUrls` | unsupported (`fingerprint_incomplete`) |

### Safety limits

| Limit | Value |
|-------|-------|
| Max HTTP requests / invocation | 12 |
| Max sitemap fetches | 2 |
| Max product pages | 10 |
| Max results returned | 6 |
| Per-request timeout | 8s |
| Cache TTL | 24h (`scripts/cache/schema-sitemap-exec/`) |

### Telemetry (per SCHEMA_OR_SITEMAP attempt)

| Field | Meaning |
|-------|---------|
| `candidateUrlsExamined` | Ranked sitemap URLs considered for fetch |
| `productPagesFetched` | Product page HTTP requests attempted |
| `productPagesBlocked` | Pages skipped due to anti-bot signals |

### Enable locally

```bash
npm run fingerprint:backfill -- --probe --supplier-id abc_supply_hsv

FINGERPRINT_ROUTER_ENABLED=true \
FINGERPRINT_ROUTER_SUPPLIER_ALLOWLIST=abc_supply_hsv \
FINGERPRINT_ROUTER_EXECUTION_TIMEOUT_MS=15000 \
npm run fingerprint:validate-chain
```

### Tests

```bash
npx tsx src/lib/suppliers/schema/__tests__/extractProductMetadata.test.ts
npx tsx src/lib/suppliers/schema/__tests__/executeSchemaOrSitemapSearch.test.ts
npx tsx src/lib/suppliers/routing/__tests__/executeExtractionStrategy.test.ts
npx tsx src/lib/suppliers/routing/__tests__/executeExtractionStrategyChain.test.ts
```

## Not in scope (3B.1)

- Gulf Eagle / broader cohort
- `HTML_SCRAPE`, `PLAYWRIGHT`, `ANTI_BOT_EVALUATION` executors
- Router planning / viability changes
- Fresh sitemap discovery at execution time

## Phase 3B.3 — Trane Supply (`trane_supply_hsv`)

Third validation supplier — proves schema executor outside ABC's WordPress sitemap pattern.

### Allowlist

`SCHEMA_OR_SITEMAP_ALLOWLIST`:

- `abc_supply_hsv`
- `gulfeagle_hsv`
- `trane_supply_hsv`

### Prerequisites

```bash
npm run fingerprint:backfill -- --probe --supplier-id trane_supply_hsv
```

### Enable locally

```bash
FINGERPRINT_ROUTER_ENABLED=true \
FINGERPRINT_ROUTER_SUPPLIER_ALLOWLIST=abc_supply_hsv,gulfeagle_hsv,trane_supply_hsv \
FINGERPRINT_ROUTER_EXECUTION_TIMEOUT_MS=15000 \
npx tsx scripts/fingerprint/validate-phase3b3-trane-schema.ts
```

### Validation queries

- commercial HVAC
- air handler
- trane unit
- rooftop unit
- HVAC repair

## Not in scope (3B.3)

- Broad cohort (`hasSitemap=true` for all suppliers)
- `HTML_SCRAPE`, `PLAYWRIGHT`, `ANTI_BOT_EVALUATION`
- Router planning / storefront / API route changes

See also: [Phase 3A — Live fingerprint probes](./PHASE3A.md)
