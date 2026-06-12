# Phase 4A — HTML_SCRAPE executor rollout

Phase 4A wires the fingerprint-informed **Serp-discover → HTML-fetch** executor. Phase 4A.1 is R.E. Michel only.

## Phase 4A.1 — R.E. Michel (`re_michel_hsv`)

### Prerequisites

1. Probed fingerprint with `renderingType=SERVER_RENDERED`, `antiBotRisk=LOW`, `hasSitemap=false`:

```bash
npm run fingerprint:backfill -- --probe --supplier-id re_michel_hsv
```

2. Router allowlist:

```bash
FINGERPRINT_ROUTER_ENABLED=true
FINGERPRINT_ROUTER_SUPPLIER_ALLOWLIST=re_michel_hsv
FINGERPRINT_ROUTER_EXECUTION_TIMEOUT_MS=15000
```

### Target chain (R.E. Michel)

```
HTML_SCRAPE
  ↓ success → router results (no legacy)

HTML_SCRAPE
  ↓ empty / error / unsupported
SERP_SITE_ORGANIC
  ↓ empty / error
PROBABILISTIC_CATEGORY_PROFILE
  ↓ empty / error
legacy emergency fallback (once, after chain exhausted)
```

### Execution flow

1. SerpAPI organic search: `site:remichel.com {query}`
2. Filter same-domain links; exclude blog/documentation/unknown URLs
3. Rank URLs by query token overlap
4. Fetch up to 8 pages (3 concurrent)
5. Extract title + URL (optional image/brand); never price
6. Skip pages with `antiBotRisk` HIGH/HARD_BLOCK
7. Return success if ≥1 result meets relevance threshold (0.25)

### Guards

| Condition | Result |
|-----------|--------|
| Supplier not in allowlist | unsupported |
| Missing domain | empty |
| Missing Serp API key | empty (zero candidates) |

### Safety limits

| Limit | Value |
|-------|-------|
| Max Serp calls / invocation | 1 |
| Max page fetches | 8 |
| Max results returned | 6 |
| Fetch concurrency | 3 |
| Per-request timeout | 8s |
| Cache TTL | 24h (`scripts/cache/html-scrape-exec/`) |

### Telemetry (per HTML_SCRAPE attempt)

| Field | Meaning |
|-------|---------|
| `candidateUrlsExamined` | Ranked Serp URLs considered for fetch |
| `pagesFetched` | Page HTTP requests attempted |
| `pagesBlocked` | Pages skipped due to anti-bot signals |
| `extractionSuccessCount` | Pages yielding valid title+URL |
| `latencyMs` | Executor wall time |
| `discoverySource` | `"serp"` (Phase 4A) |
| `serpOrganicCount` | Raw Serp organic hits before filter |
| `topUrlScore` | Best URL relevance score |

### Enable locally

```bash
npm run fingerprint:backfill -- --probe --supplier-id re_michel_hsv

FINGERPRINT_ROUTER_ENABLED=true \
FINGERPRINT_ROUTER_SUPPLIER_ALLOWLIST=re_michel_hsv \
FINGERPRINT_ROUTER_EXECUTION_TIMEOUT_MS=15000 \
npm run dev
```

### Validate

```bash
npx tsx scripts/fingerprint/validate-phase4a-remichel-html.ts
```

Queries: `boiler`, `water heater`, `copper pipe`, `r22`, `thermostat`

### Files

| File | Role |
|------|------|
| `src/lib/suppliers/html/executeHtmlScrapeSearch.ts` | Orchestrator |
| `src/lib/suppliers/html/discoverHtmlCandidateUrls.ts` | Serp URL discovery |
| `src/lib/suppliers/html/fetchHtmlScrape.server.ts` | Fetch + cache |
| `src/lib/suppliers/routing/resolveHtmlScrapeExecution.ts` | Allowlist guard |

### Phase 4B (not started)

- gzip sitemap fix for Wittichen schema primary path
- HTML entity decoding in titles (`&amp;` → `&`)
- Category-query relevance tuning for queries like `furnace` / `condenser`
- Re Michel supplier-specific catalog adapter (dealer portal)
