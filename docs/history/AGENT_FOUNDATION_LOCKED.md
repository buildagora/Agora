# ⚠️ Agent Foundation FROZEN - Do Not Modify Without Explicit Approval

## Summary
The Agent Thread foundation is **FROZEN** as a stable platform layer. All guardrails, invariants, error hardening, and minimal tests have been implemented to lock the Agent Threads foundation for production.

## What This Layer Does

This foundation provides:
- **Thread lifecycle management**: Create, read, update, delete threads (user-scoped)
- **Draft persistence**: Canonical draft storage in database (thread.draft)
- **Message idempotency**: Append-only messages with duplicate ID prevention
- **Authorization**: User-scoped access control (users can only access their own threads)
- **Error handling**: Consistent error shapes, Prisma error normalization
- **Observability**: Dev + prod-safe logging for key operations

## What This Layer Does NOT Do

This foundation explicitly does NOT:
- Handle agent AI logic (orchestrator, slot filler, etc.)
- Handle RFQ creation or routing
- Handle UI rendering (components are separate)
- Handle authentication (uses auth layer)
- Handle business logic beyond thread/draft persistence

## Frozen Files

The following files are **FROZEN** and must not be modified without explicit approval:

1. **`src/app/buyer/agent/BuyerAgentClient.tsx`**
   - Core client lifecycle and state management
   - Thread creation single-flight guard
   - Draft operation guards

2. **`src/lib/agentThreads.ts`**
   - Thread persistence layer
   - Draft canonicalization
   - API-backed operations

3. **`src/app/api/agent/threads/route.ts`**
   - Thread list and create endpoints
   - Authentication and scoping

4. **`src/app/api/agent/threads/[id]/route.ts`**
   - Thread detail endpoints (GET, PATCH, DELETE)
   - PATCH operation whitelist
   - Message idempotency
   - Draft canonicalization

5. **`src/lib/agent/guards.ts`**
   - Client-side guards (assertThreadId, guardReadyState)

6. **`src/lib/agent/serverGuards.ts`**
   - Server-side ownership guards (requireThreadForUser)

## Changes Requiring Design Review

Any changes to frozen files require:
1. **Design review** for behavior changes
2. **Test updates** for logic changes
3. **Documentation updates** for API changes
4. **Approval** from foundation maintainers

Types of changes that require review:
- Adding new PATCH operations
- Changing draft canonicalization rules
- Modifying thread creation flow
- Changing error response shapes
- Adding new invariants or guards
- Removing or weakening existing guards

## Implemented Guardrails

### A) Client Guards (`src/lib/agent/guards.ts`)
- ✅ `assertThreadId(threadId)` - Validates threadId is non-empty string
- ✅ `guardReadyState(state, operation)` - Checks threadId, authReady, isSending
- ✅ Integrated into `BuyerAgentClient.tsx`:
  - `handleSendMessage` uses guards before sending
  - `handleDraftFieldChange` uses guards before draft operations
  - All operations fail closed with user feedback

### B) Thread Creation Single-Flight Guard
- ✅ `isCreatingThread` ref prevents duplicate thread creation
- ✅ Thread creation failures surface errors, no automatic retries
- ✅ No infinite loops possible

### C) Server-Side Auth + Ownership Enforcement
- ✅ `requireThreadForUser(prisma, threadId, userId)` in `src/lib/agent/serverGuards.ts`
- ✅ All agent routes use this guard:
  - `GET /api/agent/threads/[id]` - Uses guard
  - `PATCH /api/agent/threads/[id]` - Uses guard
  - `DELETE /api/agent/threads/[id]` - Uses guard
- ✅ Distinguishes `NOT_FOUND` (404) from `UNAUTHORIZED` (403)

### D) PATCH Operation Whitelist
- ✅ Strict whitelist in `/api/agent/threads/[id]`:
  - `appendMessage`
  - `applyDraftPatch`
  - `clearDraft`
  - `setTitle`
  - `updateMeta`
- ✅ Unknown operations rejected with `INVALID_OPERATION` (400)

### E) Message Idempotency (Server)
- ✅ Duplicate message IDs checked before appending
- ✅ Returns 200 OK (idempotent success) if message ID already exists
- ✅ Never allows message overwrite or reordering

### F) Error Shape Normalization
- ✅ All routes use `jsonOk(data)` or `jsonError(code, message, status)`
- ✅ `withErrorHandling` catches Prisma errors and normalizes them
- ✅ Prisma errors never leak to client (masked in production)

### G) Observability
- ✅ Server logs (dev + prod-safe with `LOG_AGENT_OPS=true`):
  - `[AGENT_THREAD_CREATED]` - threadId, userId, title, timestamp
  - `[AGENT_MESSAGE_APPENDED]` - threadId, messageId, role, userId, timestamp
  - `[AGENT_DRAFT_UPDATED]` - threadId, userId, patchKeys, timestamp
  - `[AGENT_DRAFT_CLEARED]` - threadId, userId, timestamp
  - `[AGENT_THREAD_ACCESSED]` - threadId, userId, timestamp
  - `[AGENT_THREAD_OPERATION]` - threadId, userId, operation, timestamp
- ✅ No content logged (only metadata)

### H) Regression Tests
- ✅ Test script: `scripts/test-agent-threads.ts`
- ✅ Tests:
  1. Thread lifecycle: create → list → delete (user-scoped)
  2. Draft canonicalization: legacy keys in → canonical keys stored
  3. Authorization isolation: user A cannot read user B's thread

## Files Created/Modified

### New Files:
- `src/lib/agent/guards.ts` - Client-side guards
- `src/lib/agent/serverGuards.ts` - Server-side ownership guards
- `src/lib/agent/__tests__/agentThreads.test.ts` - Jest test file
- `scripts/test-agent-threads.ts` - Integration test script

### Modified Files:
- `src/app/buyer/agent/BuyerAgentClient.tsx` - Uses client guards, single-flight thread creation
- `src/app/api/agent/threads/[id]/route.ts` - Uses server guards, PATCH whitelist, message idempotency, observability
- `src/app/api/agent/threads/route.ts` - Observability logs

## Verification Steps

### 1. Run Tests
```bash
cd /Users/michael/agora/agora
npx tsx scripts/test-agent-threads.ts
```

**Expected**: All 3 tests pass

### 2. Test Thread Creation (Single-Flight)
1. Navigate to `/buyer/agent`
2. Rapidly click "New Chat" multiple times
3. **Expected**: Only one thread created (no duplicates)

### 3. Test Draft Operations (Guards)
1. Try to change a draft field without an active thread
2. **Expected**: Error toast, no draft operation attempted

### 4. Test Message Idempotency
```bash
# Send same message twice (same message ID)
curl -X PATCH "http://127.0.0.1:3000/api/agent/threads/{threadId}" \
  -H "Cookie: ..." \
  -H "Content-Type: application/json" \
  -d '{"op": "appendMessage", "message": {"id": "test-msg-1", "role": "user", "content": "test", "timestamp": 123456}}'

# Send again with same ID
curl -X PATCH "http://127.0.0.1:3000/api/agent/threads/{threadId}" \
  -H "Cookie: ..." \
  -H "Content-Type: application/json" \
  -d '{"op": "appendMessage", "message": {"id": "test-msg-1", "role": "user", "content": "test", "timestamp": 123456}}'
```

**Expected**: Second call returns 200 OK (idempotent), message not duplicated

### 5. Test PATCH Operation Whitelist
```bash
curl -X PATCH "http://127.0.0.1:3000/api/agent/threads/{threadId}" \
  -H "Cookie: ..." \
  -H "Content-Type: application/json" \
  -d '{"op": "unknownOperation", "data": {}}'
```

**Expected**: 400 Bad Request with `INVALID_OPERATION` error

### 6. Test Authorization Isolation
1. Create thread as User A
2. Try to access thread as User B (different account)
3. **Expected**: 403 Forbidden or 404 Not Found (depending on implementation)

### 7. Check Observability Logs
```bash
# Set env var to enable logs
export LOG_AGENT_OPS=true
npm run dev

# Perform operations and check console for:
# [AGENT_THREAD_CREATED]
# [AGENT_MESSAGE_APPENDED]
# [AGENT_DRAFT_UPDATED]
```

**Expected**: Logs appear with metadata (no content)

## Invariants Enforced

✅ **AgentThread (DB) is the single source of truth**
✅ **NO agent mutation may run without a valid threadId** (assertThreadId)
✅ **A user may ONLY access their own threads** (requireThreadForUser)
✅ **Messages are append-only and idempotent** (duplicate ID check)
✅ **Drafts: Canonical keys only** (whitelist enforcement)
✅ **Unknown PATCH operations must be rejected** (operation whitelist)
✅ **Thread creation must be idempotent** (single-flight guard)
✅ **If thread creation fails, agent MUST fail closed** (no draft ops, no message sends)
✅ **No uncaught errors from UI event handlers** (try-catch + guards)
✅ **Draft ops must no-op if agent not ready** (guardReadyState)
✅ **All /api/agent/** routes authenticate and scope by userId** (requireCurrentUserFromRequest + requireThreadForUser)
✅ **Prisma errors must never leak to client** (withErrorHandling)
✅ **All agent routes return consistent error shapes** (jsonOk/jsonError)

## Checklist

- [x] Guards enforced (client + server)
- [x] Ops whitelisted (PATCH operations)
- [x] Ownership enforced (requireThreadForUser)
- [x] Message idempotency (duplicate ID check)
- [x] Draft canonicalization (legacy keys stripped)
- [x] Thread creation single-flight (isCreatingThread guard)
- [x] Error normalization (jsonOk/jsonError)
- [x] Observability logs (dev + prod-safe)
- [x] Tests created (3 regression tests)
- [x] No Prisma errors leak to client (withErrorHandling)

## Next Steps

1. Run `npx tsx scripts/test-agent-threads.ts` to verify tests pass
2. Test in browser: navigate to `/buyer/agent` and verify all operations work
3. Check server logs for observability output
4. Verify no console errors in browser DevTools
