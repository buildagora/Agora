# Supplier fingerprinting — Phase 0 CLI

Phase 0 populates **facts only** in `SupplierFingerprint` and compares legacy routing labels to the new router **in memory**. Production search, Serp, and platform executors are **not** wired to this layer.

## What Phase 0 does

- Backfill fingerprint **facts** from legacy `supplierSiteSearchConfig` / `supplierDomainPlatformConfig`
- Aggregate material-request recipient counts into `demandScore` / `demandPriority`
- Run shadow reports: `resolveLegacyStrategy()` vs `resolveExtractionStrategy()`
- Write shadow results to `scripts/output/fingerprint/` (JSON + CSV)

## What Phase 0 does not do

- Store `chosenStrategy` in the database (Option B — derived at read/report time)
- Call SerpAPI, platform catalog executors, or HTTP probes
- Change `resolveSupplierDiscovery`, API routes, storefront fetch, or adapters
- Import the router from any production search path

## Command order

1. Apply migration (if not already): `npm run db:migrate`
2. Dry-run backfill: `npm run fingerprint:backfill:dry`
3. Backfill facts: `npm run fingerprint:backfill`
4. Shadow report: `npm run fingerprint:shadow`

Optional flags (both scripts):

- `--limit N` — process first N suppliers (ordered by id)
- `--supplier-id <id>` — single supplier

Backfill only:

- `--dry-run` — compute facts and print summary without writing

Shadow only:

- `--only-mismatches` — omit `EXACT_MATCH` rows from CSV/JSON row list

## Safety warnings

- Run against **staging or local** first; backfill upserts one row per supplier.
- Scripts use `getPrisma()` and respect dev DB lock when configured.
- Env vars affect **platform access facts** only (presence check, not live API calls).
- Shadow output may show `EXPECTED_FUTURE` mismatches (e.g. legacy `PLATFORM_API` vs router `PROBABILISTIC_CATEGORY_PROFILE` when Bloomreach binding is incomplete).

## Rollback

- Production code does not read `SupplierFingerprint` in Phase 0.
- To undo data: `TRUNCATE "SupplierFingerprint";` or drop the table via a down migration.
- Deleting report files under `scripts/output/fingerprint/` has no runtime effect.

## Tests (no DB)

```bash
npx tsx src/lib/suppliers/fingerprint/__tests__/normalizeCanonicalDomain.test.ts
npx tsx src/lib/suppliers/fingerprint/__tests__/resolvePlatformAccess.test.ts
npx tsx src/lib/suppliers/fingerprint/__tests__/buildFactsFromLegacy.test.ts
npx tsx src/lib/suppliers/routing/__tests__/resolveExtractionStrategy.test.ts
npx tsx src/lib/suppliers/routing/__tests__/resolveLegacyStrategy.test.ts
npx tsx src/lib/suppliers/routing/__tests__/shadowCompare.test.ts
```
