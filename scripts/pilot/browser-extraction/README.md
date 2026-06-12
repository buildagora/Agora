# Browser Extraction Pilot — City Electric Supply

Local proof-of-concept only. **Not wired to storefront, API, prewarm, or supplier adapters.**

## Goal

Prove that a **headed real browser** can extract anonymous public product search results from City Electric Supply when server-side `fetch()` is blocked by Cloudflare.

## Success criteria

- Query: `wire`
- Domain: `cityelectricsupply.com`
- Anonymous (no login, no dealer portal)
- **≥6** products with `title`, `imageUrl`, `productUrl`, `classification: PRODUCT_PAGE`

## Phase 0 — Manual validation

1. Open `https://www.cityelectricsupply.com/` in Chrome/Safari.
2. Pass Cloudflare if prompted.
3. Dismiss branch/location modal without logging in.
4. Search **`wire`**.
5. Confirm ≥6 product cards with images and PDP links.

## Phase 1 — Automated pilot

### Prerequisites

```bash
npm install
npx playwright install chromium
# Optional: uses system Chrome if available
```

### Run

```bash
npx tsx scripts/pilot/browser-extraction/run-city-electric.ts
npx tsx scripts/pilot/browser-extraction/run-city-electric.ts --query wire
npx tsx scripts/pilot/browser-extraction/run-city-electric.ts --headless   # control only
```

### Output

- JSON: `scripts/pilot/browser-extraction/output/city-electric-pilot-*.json`
- Screenshot: `scripts/pilot/browser-extraction/artifacts/city-electric-*.png`
- HTML snapshot: `scripts/pilot/browser-extraction/artifacts/city-electric-*.html`

Exit code **0** = pass, **1** = fail.

## Rollback

Delete `scripts/pilot/browser-extraction/`. No production files are modified.

## Latest pilot result (automated)

**Status: FAIL** (headed Playwright from automation/datacenter egress)

- Cloudflare returned **“Sorry, you have been blocked”** (hard block, not a solvable challenge).
- Product count: **0**
- **Do not add Northern Tool** until City Electric passes on a residential/manual browser run.

Re-run locally on a home network (not VPN/datacenter):

```bash
npx tsx scripts/pilot/browser-extraction/run-city-electric.ts --query wire
```

If manual Chrome on the same machine shows products but this script does not, the blocker is **automation fingerprint / IP**, not missing inventory.
