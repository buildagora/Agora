# Phase 3A — Live fingerprint probes (discovery only)

Phase 3A teaches `SupplierFingerprint` new facts via **read-only HTTP probes**. No router executors are wired.

## Scope (Commit 1)

| Probe | Module | Facts |
|-------|--------|-------|
| Schema / sitemap | `probeSchemaSitemap.server.ts` | `hasSchemaMarkup`, `hasSitemap`, `sitemapUrls` |
| Rendering / SPA / anti-bot | `probeRendering.server.ts` | `renderingType`, `isSPA`, `antiBotRisk` |

**Not in scope:** `SCHEMA_OR_SITEMAP`, `HTML_SCRAPE`, `PLAYWRIGHT`, or `ANTI_BOT_EVALUATION` execution.

## Safety

- Max **5 HTTP requests/domain** for schema/sitemap probe
- Homepage + optional search URL for rendering probe
- Per-request timeout (12s default)
- Disk cache under `scripts/cache/fingerprint-probe/` (7-day TTL)
- User-Agent: `Agora/1.0 (+supplier-discovery; fingerprint-probe)`
- No auth, no bot bypass, no credential use

## Enable probes

```bash
# Explicit supplier (any ID)
npm run fingerprint:backfill -- --probe --supplier-id abc_supply_hsv

# Env flag + explicit supplier
FINGERPRINT_PROBE_ENABLED=true npm run fingerprint:backfill -- --supplier-id abc_supply_hsv

# Cohort-only (abc_supply*, lansing*, gulfeagle*) when --probe without --supplier-id
npm run fingerprint:backfill -- --probe --limit 50
```

When `--probe` is **disabled**, backfill behavior is unchanged (legacy facts only).

When `--probe` is enabled **without** `--supplier-id`, only the **initial cohort** is probed:

- `abc_supply_*`
- `lansing_*`
- `gulfeagle_*`

Other suppliers in a full backfill are upserted with legacy facts only.

## Initial validation cohort

```bash
npm run fingerprint:backfill -- --probe --supplier-id abc_supply_hsv
npm run fingerprint:backfill -- --probe --supplier-id lansing_<local_id>
npm run fingerprint:backfill -- --probe --supplier-id gulfeagle_<local_id>
```

## Tests

```bash
npx tsx src/lib/suppliers/fingerprint/__tests__/probeSchemaSitemap.test.ts
npx tsx src/lib/suppliers/fingerprint/__tests__/probeRendering.test.ts
```

## Next step (Phase 3B — not started)

After probes confirm `hasSchemaMarkup` or `hasSitemap` for a supplier, wire `SCHEMA_OR_SITEMAP` executor for one allowlisted supplier (likely `abc_supply_hsv`).

See also: [Phase 2 — Platform executor rollout](./PHASE2.md)
