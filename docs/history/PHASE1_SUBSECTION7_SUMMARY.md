# Phase 1 / Subsection 7: Canonical RFQ Pipeline Contract Tests + Minimal Diagnostics

## Summary

Successfully implemented contract tests and minimal diagnostics for the canonical RFQ creation pipeline to prevent regressions where:
- Agent says created but nothing appears
- RFQ persists but dashboards don't show it
- Preferred/direct visibility targets get lost
- Notifications/email dispatch silently fails

## Deliverables

### 1. Test Storage Helpers (`src/lib/rfq/testStorageHelpers.ts`)

Created storage adapter helpers that allow tests to read/write the same keys used in production:
- `testReadBuyerRfqs(buyerId)` - Reads `agora.data.<userId>.rfqs`
- `testReadGlobalFeed()` - Reads `agora.feed.rfqs`
- `testClearStorage(buyerId)` - Clears buyer and global storage
- `testReadSuppliers()` - Reads `agora:suppliers:v1`
- `testReadSentNotifications()` - Reads `agora:sentNotifications:v1`

**Storage Keys Asserted:**
- `agora.data.<userId>.rfqs` - Buyer-scoped RFQ list
- `agora.feed.rfqs` - Global feed for sellers
- `agora:suppliers:v1` - Supplier index
- `agora:sentNotifications:v1` - Email idempotency tracking

### 2. Contract Tests (`scripts/test-create-rfq-contract.ts`)

Added comprehensive contract tests for `createRFQFromBuyerInput()` covering:

**a) Manual-equivalent creation:**
- ✅ Calls `createRFQFromBuyerInput({source:"manual", buyerId, payload...})`
- ✅ Asserts RFQ is written to global feed key AND buyer's RFQ list key
- ✅ Asserts returned `rfqId` exists in both storages

**b) Agent-equivalent creation:**
- ✅ Calls `createRFQFromBuyerInput({source:"agent", buyerId, payload...})`
- ✅ Same asserts as (a)

**c) Visibility + targeting:**
- ✅ With `visibility="direct"` and `targetSupplierIds=[supplierId]`, asserts persisted RFQ includes those fields and `targetSupplierIdsCount=1`

**d) CategoryId/label correctness:**
- ✅ Input categoryId `roofing` -> stored category label "Roofing" (matching existing UI expectations)

**e) Non-blocking email:**
- ✅ Stubbed/guarded email sending so tests don't require real RESEND key
- ✅ Function returns `ok:true` even if email is unavailable in test env
- ✅ Records safe diagnostic flag (`emailSkippedReason: "test_env"`)

**f) Additional tests:**
- ✅ Invalid category validation
- ✅ RFQ number generation

**Test Results:** All 7 tests pass ✅

### 3. Minimal Diagnostics (`src/lib/rfq/createRFQ.ts`)

Added optional diagnostics object returned in `CreateRFQResult` when `NODE_ENV !== "production"`:

```typescript
diagnostics: {
  storageWrites: {
    wroteBuyer: boolean,
    wroteGlobal: boolean
  },
  notificationAttempted: boolean,
  emailAttempted: boolean,
  emailSkippedReason?: "missing_env" | "test_env" | "error"
}
```

**Key Features:**
- ✅ Diagnostics only present in non-production environments
- ✅ NOT shown in UI (console logging only behind dev flag)
- ✅ Tracks all critical operations: storage writes, notifications, email
- ✅ Non-blocking: email failures don't prevent RFQ creation

### 4. Agent Flow Regression Test (`scripts/test-agent-ui-contract.ts`)

Extended agent UI contract test to simulate:
- ✅ Orchestrator confirm -> translator payload -> `createRFQFromBuyerInput` called
- ✅ Mode gating rules:
  - ✅ Does not enter CREATED mode unless `createRFQ ok:true`
  - ✅ RFQ NOT persisted when `createRFQ ok:false`
  - ✅ Draft clearing only happens on success (implicit via mode gating)

**Test Results:** All 9 tests pass ✅

### 5. Updated RFQPayload Interface

Added support for visibility and targeting:
```typescript
export interface RFQPayload {
  // ... existing fields
  visibility?: "broadcast" | "direct";
  targetSupplierIds?: string[];
}
```

This ensures preferred/direct visibility targets are preserved through the creation pipeline.

## Regressions Prevented

1. **Agent says created but nothing appears:**
   - ✅ Tests verify RFQ is written to both buyer storage AND global feed
   - ✅ Diagnostics track both storage writes

2. **RFQ persists but dashboards don't show it:**
   - ✅ Tests verify RFQ exists in buyer-scoped storage (`agora.data.<userId>.rfqs`)
   - ✅ Tests verify RFQ exists in global feed (`agora.feed.rfqs`)

3. **Preferred/direct visibility targets get lost:**
   - ✅ Tests verify `visibility` and `targetSupplierIds` are preserved in stored RFQ
   - ✅ RFQPayload interface updated to include these fields

4. **Notifications/email dispatch silently fails:**
   - ✅ Diagnostics track `notificationAttempted` and `emailAttempted`
   - ✅ Diagnostics record `emailSkippedReason` when email is unavailable
   - ✅ Email failures are non-blocking (RFQ creation still succeeds)

5. **Mode gating violations:**
   - ✅ Tests verify CREATED mode only entered when `createRFQ ok:true`
   - ✅ Tests verify RFQ NOT persisted when `createRFQ ok:false`

## Test Commands

```bash
npm run test:create-rfq  # Run RFQ creation contract tests
npm run test:agent-ui    # Run agent UI contract tests (includes mode gating)
```

## Files Modified

1. **New Files:**
   - `src/lib/rfq/testStorageHelpers.ts` - Storage adapter helpers for tests

2. **Modified Files:**
   - `src/lib/rfq/createRFQ.ts` - Added diagnostics, fixed pushNotification call, added visibility/targeting support
   - `scripts/test-create-rfq-contract.ts` - Fixed async test handling, updated category test
   - `scripts/test-agent-ui-contract.ts` - Added localStorage mocks, added mode gating tests, defined TEST_BUYER_ID

## Constraints Met

- ✅ No product UI/UX changes
- ✅ No new pages added
- ✅ Additive + refactor-safe only
- ✅ No dev diagnostics displayed in app UI (console logging only behind dev flag)
- ✅ Tests are deterministic
- ✅ All tests pass

## Notes

- `window.dispatchEvent` warnings in test output are expected (Node.js environment) and non-blocking
- Email diagnostics track attempts but don't block RFQ creation on failure
- Storage helpers use the same keys as production, ensuring tests catch real regressions










