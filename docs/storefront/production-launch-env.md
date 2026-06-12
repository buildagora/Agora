# Storefront production launch — environment checklist

Set these in **staging** and **production** before enabling the unified storefront rollout.

## Required

| Variable | Value | Purpose |
|----------|-------|---------|
| `DATABASE_URL` | PostgreSQL connection string | Prisma, requests, suppliers |
| `SERPAPI_API_KEY` | Valid SerpAPI key | Home Depot / Lowe's catalog adapters |
| `SUPPLIER_STOREFRONT_ENABLED` | `1` | Marks storefront feature on in view model / analytics |

## Router (platform + distributor catalog)

| Variable | Recommended production value | Purpose |
|----------|------------------------------|---------|
| `FINGERPRINT_ROUTER_EXECUTION_MODE` | `promoted` | Orchestrator-first for promoted suppliers |
| `FINGERPRINT_ROUTER_ENABLED` | `true` | Enable fingerprint router |
| `FINGERPRINT_ROUTER_PROMOTED_SUPPLIERS` | See list below | Storefront catalog via platform adapters |

### Suggested `FINGERPRINT_ROUTER_PROMOTED_SUPPLIERS`

Comma-separated (no spaces), include storefront-critical suppliers:

```
floor_decor_hsv,johnstone_hsv,wittichen_hsv,abc_supply_hsv,gulfeagle_hsv,trane_supply_hsv,re_michel_hsv,ll_flooring_hsv,cmn90dbjr000404ldzhcsquav,lennox_hsv,siteone_hsv,siteone_north_hsv,ppg_paint_hsv,ferguson_plumbing_hsv
```

Home Depot and Lowe's use **product_engine adapter bypass** (`searchHomeDepotPaged` / `searchLowesPaged`) and do **not** require router promotion.

## Optional / tuning

| Variable | Default | Notes |
|----------|---------|-------|
| `FINGERPRINT_ROUTER_SUPPLIER_ALLOWLIST` | — | Legacy allowlist; keep in sync if using `allowlist` mode |
| `FINGERPRINT_ROUTER_SHADOW` | `false` | Disable in production |
| `FINGERPRINT_ROUTER_EXECUTION_TIMEOUT_MS` | `8000`–`15000` | Router timeout |
| `FINGERPRINT_STOREFRONT_ORCHESTRATOR_CONVERGENCE_DISABLED` | unset | Set `true` only to force legacy discovery path |

## Cache

Storefront catalog API uses `Cache-Control: private, max-age=60, stale-while-revalidate=120`. No extra env vars required.

## Not used to gate UI

`SUPPLIER_STOREFRONT_ENABLED` does **not** hide the storefront UI — set to `1` for consistent analytics only.

## Pre-deploy verification

```bash
# Local / CI
npm run build
npx tsc --noEmit
npm run test:build-storefront-view
npm run test:storefront-images

# Staging smoke (dev server or staging URL)
STOREFRONT_SCREENSHOT_BASE=https://staging.example.com \
  npx tsx scripts/validation/storefront-phase11.8-launch.ts
```

## Post-deploy smoke

See `scripts/validation/storefront-phase11.8-launch.ts` output checklist.
