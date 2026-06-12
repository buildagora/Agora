# Phase 1A — Shadow-only router integration

Phase 1A wires the fingerprint router into **`searchSupplierDiscoveryForSupplier` only**. Legacy execution always returns results. No router execution, no allowlist.

## Enable locally

In `.env.local`:

```bash
FINGERPRINT_ROUTER_SHADOW=true
```

Unset or `false` → identical to pre–Phase 1A behavior (no DB read, no router, no logs).

## Verify telemetry

1. Ensure fingerprints exist: `npm run fingerprint:backfill`
2. Set `FINGERPRINT_ROUTER_SHADOW=true`
3. Trigger discovery (e.g. API call that uses `searchSupplierDiscoveryForSupplier`, or prewarm path that hits discovery)
4. Look for JSON lines on stdout:

```json
{"event":"supplier_extraction_shadow","supplierId":"...","legacyStrategy":"...","routerStrategy":"...","matchStatus":"...","executionPath":"legacy","shadowEnabled":true,...}
```

Missing fingerprint:

```json
{"event":"supplier_extraction_shadow","supplierId":"...","explanation":"fingerprint_missing","executionPath":"legacy","shadowEnabled":true}
```

## Coverage gap (intentional)

Shadow runs only on **`searchSupplierDiscoveryForSupplier`**. Registry adapter shortcuts (Home Depot / Lowe's product engine) and storefront fetch are unchanged until a later phase.

## Long-term direction

Legacy **routing maps** will be deleted; useful **executors** (Serp, platform modules, product engine) remain and will be called by the router in Phase 1B+.

## Tests

```bash
npx tsx src/lib/suppliers/routing/__tests__/routerFlags.test.ts
npx tsx src/lib/suppliers/routing/__tests__/resolveSupplierExtractionShadow.test.ts
```
