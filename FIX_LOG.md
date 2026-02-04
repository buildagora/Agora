# Agora Fix Log

## Issue A: Seller RFQ Feed — Job Name / PO # as Primary Title

### Problem
Buyer provides "Job Name / PO #" (e.g., "Agora Test") but Seller RFQ Feed card shows generic title like "Bundles" instead.

### Root Cause
- RFQ object has `jobNameOrPo` field, but seller feed card rendering uses `rfq.title` which may be auto-generated from line items
- The `jobNameOrPo` field is not being prioritized in the display logic

### Fix Approach
1. Update seller feed card rendering to use `rfq.jobNameOrPo` as primary title if present
2. Fallback to `rfq.title` if `jobNameOrPo` is missing
3. Ensure `jobNameOrPo` is persisted when agent sends RFQ
4. Update seller RFQ detail page to show `jobNameOrPo` prominently

### Acceptance Criteria
- ✅ If buyer enters Job Name/PO, it shows as main RFQ title in seller feed and detail page
- ✅ Existing RFQs without Job/PO still render fine (fallback to title)

---

## Issue B: Agent Chat Stalling — Numeric-Only Answers + Typos

### Problem
When agent asks "How many squares?" and user replies "10" (just a number), agent sometimes does not respond. Same with misspellings like "shinle".

### Root Cause
- `parseRoofSizeSquares` requires context words like "square" or "sq" to extract numbers
- `parseRoofMaterialType` doesn't handle common typos
- When parsing fails, agent state machine may not generate a reprompt, causing silence

### Fix Approach
1. Add `normalizeInput()` helper: trim, lower, collapse whitespace
2. Enhance `parseRoofSizeSquares` to accept standalone numbers when `expectedField === "squares"`
3. Add typo tolerance for common domain words (shingle, metal, yes/no)
4. Ensure agent always reprompts with example when parse fails
5. Add dev log `PARSE_FAIL_{expectedField}` for debugging

### Acceptance Criteria
- ✅ Replying "10" always advances conversation when squares are expected
- ✅ "shinle" is recognized as shingle and advances
- ✅ If input truly cannot be parsed, agent responds with helpful reprompt instead of doing nothing

---

## Issue C: Routing — Preferred Supplier Path Must Not Broadcast

### Problem
Buyer has preferred supplier rules per category. When request is "fastest" / "preferred supplier", it should route ONLY to those preferred suppliers, but currently it goes to everyone.

### Root Cause
- `buildRoutingPlan` for "preferred" priority falls back to `broadcast_category` when no preferred suppliers are eligible
- `buildRoutingPlan` for "fastest" priority doesn't enforce preferred-only mode when buyer explicitly wants preferred
- No clear `routeMode` distinction between "preferred_only" and "category_broadcast"

### Fix Approach
1. Introduce `routeMode` in routing plan: `"preferred_only" | "category_broadcast"`
2. When `priority === "preferred"` or buyer explicitly wants preferred routing:
   - Set `routeMode = "preferred_only"`
   - If no eligible preferred suppliers, return error/agent message asking if buyer wants to broadcast instead
   - Do NOT silently fallback to broadcast
3. When `priority === "fastest"` and buyer has preferred suppliers:
   - Check if buyer wants preferred-only (from agent answers)
   - If yes, use `routeMode = "preferred_only"`
   - If no, use `routeMode = "category_broadcast"` but prefer preferred suppliers first
4. Ensure dispatch function respects `routeMode` and doesn't re-expand

### Acceptance Criteria
- ✅ Preferred-only requests go only to preferred suppliers
- ✅ No silent fallback to broadcast
- ✅ Best-price requests go to all eligible suppliers in category
- ✅ Supplier notifications (feed + email) are sent only to intended recipients

---

## Issue D: Buyer Dashboard — Manual RFQ Creation Must Exist

### Problem
Buyer Dashboard → Material Requests → New RFQ redirects into the Agent. Buyers should also be able to submit manually.

### Root Cause
- `/buyer/rfqs/new` page exists but may be redirecting to agent
- Dashboard may not have clear manual creation option
- Navigation may force agent flow

### Fix Approach
1. Ensure `/buyer/rfqs/new` page is accessible and doesn't redirect to agent
2. Update buyer dashboard to offer both options:
   - "Create with Agent" → `/buyer/agent`
   - "Create Manually" → `/buyer/rfqs/new`
3. Remove any forced redirects from manual creation page
4. Ensure routes are correct

### Acceptance Criteria
- ✅ Buyer can create RFQ manually without touching agent
- ✅ Buyer can still choose agent if desired

---

## Implementation Status

- [x] Issue A: Seller RFQ Feed — Job Name / PO # as Primary Title ✅ COMPLETE
- [x] Issue B: Agent Chat Stalling — Numeric-Only Answers + Typos ✅ COMPLETE
- [x] Issue C: Routing — Preferred Supplier Path Must Not Broadcast ✅ COMPLETE
- [x] Issue D: Buyer Dashboard — Manual RFQ Creation Must Exist ✅ COMPLETE

## Files Modified

### Issue A: Seller RFQ Feed
- `src/app/seller/feed/page.tsx`: Updated RFQ interface to include `jobNameOrPo`, changed primary title to use `jobNameOrPo || title`, added secondary title display, updated search filter

### Issue B: Agent Chat Stalling
- `src/lib/agent/parse.ts`: Added `normalizeInput()` helper, enhanced `parseRoofSizeSquares()` to accept standalone numbers when `expectedField === "roofSizeSquares"`, added typo tolerance to `parseRoofMaterialType()`
- `src/lib/agent/stateMachine.ts`: Added parse failure tracking, always reprompt on parse failure with examples, added dev logging for parse failures

### Issue C: Preferred Supplier Routing
- `src/lib/routing/types.ts`: Added `RouteMode` type and `routeMode` field to `RoutingPlan`
- `src/lib/routing/planner.ts`: Updated all return statements to include `routeMode`, enforced `preferred_only` mode for "preferred" priority (no silent fallback), set `preferred_only` for fastest with preferred suppliers
- `src/lib/routing/dispatcher.ts`: Updated return type to include `reason` and `eligibilityDebug`, respect `routeMode` (do NOT re-expand `preferred_only` to broadcast)
- `src/lib/rfqDispatch.ts`: Added check for `preferred_only` with no targets, return helpful error message asking if buyer wants to broadcast

### Issue D: Manual RFQ Creation
- `src/app/buyer/dashboard/page.tsx`: Updated CTA card to show both "Create Manually" and "Create with Agent" options
- `src/app/buyer/rfqs/page.tsx`: Updated "New Request" button to link to `/buyer/rfqs/new` instead of `/buyer/choose-flow`

