/**
 * RFQ Readiness Gate Regression Test
 * Tests that "Everything looks good" only appears when draft is complete
 * Run with: npx tsx src/app/api/agent/__tests__/rfqReadinessGate.test.ts
 */

import { validateAgentDraftRFQ } from "@/lib/agent/contracts";
import { computeRfqStatus } from "@/lib/agent/rfqStatus";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAIL: ${message}`);
    process.exit(1);
  }
  console.log(`✅ PASS: ${message}`);
}

console.log("\n🧪 Testing RFQ Readiness Gate\n");

// Test 1: DELIVERY without deliveryAddress should NOT be ready
console.log("Test 1: DELIVERY without deliveryAddress");
const draft1 = {
  fulfillmentType: "DELIVERY",
  deliveryAddress: null,
  needBy: "2026-03-01",
  lineItems: [{ description: "Test item", unit: "EA", quantity: 1 }],
  categoryId: "roofing",
  jobNameOrPo: "Test Job",
};
const validation1 = validateAgentDraftRFQ(draft1);
assert(validation1.ok === false, "DELIVERY without deliveryAddress should NOT be ready");
assert(validation1.missing.includes("deliveryAddress"), "Missing fields should include deliveryAddress");

const status1 = computeRfqStatus({ draft: draft1 });
assert(status1.isReadyToConfirm === false, "computeRfqStatus should report not ready");
assert(status1.nextQuestionId === "deliveryAddress", "Next question should be deliveryAddress");

// Test 2: DELIVERY with empty string deliveryAddress should NOT be ready
console.log("\nTest 2: DELIVERY with empty string deliveryAddress");
const draft2 = {
  fulfillmentType: "DELIVERY",
  deliveryAddress: "",
  needBy: "2026-03-01",
  lineItems: [{ description: "Test item", unit: "EA", quantity: 1 }],
  categoryId: "roofing",
  jobNameOrPo: "Test Job",
};
const validation2 = validateAgentDraftRFQ(draft2);
assert(validation2.ok === false, "DELIVERY with empty deliveryAddress should NOT be ready");
assert(validation2.missing.includes("deliveryAddress"), "Missing fields should include deliveryAddress");

// Test 3: DELIVERY with valid deliveryAddress should be ready
console.log("\nTest 3: DELIVERY with valid deliveryAddress");
const draft3 = {
  fulfillmentType: "DELIVERY",
  deliveryAddress: "123 Main St, Birmingham, AL 35201",
  needBy: "2026-03-01",
  lineItems: [{ description: "Test item", unit: "EA", quantity: 1 }],
  categoryId: "roofing",
  jobNameOrPo: "Test Job",
};
const validation3 = validateAgentDraftRFQ(draft3);
assert(validation3.ok === true, "DELIVERY with valid deliveryAddress should be ready");
assert(validation3.missing.length === 0, "Missing fields should be empty");

const status3 = computeRfqStatus({ draft: draft3 });
assert(status3.isReadyToConfirm === true, "computeRfqStatus should report ready");
assert(status3.nextQuestionId === null, "Next question should be null when ready");

// Test 4: PICKUP without deliveryAddress should be ready
console.log("\nTest 4: PICKUP without deliveryAddress");
const draft4 = {
  fulfillmentType: "PICKUP",
  deliveryAddress: null,
  needBy: "2026-03-01",
  lineItems: [{ description: "Test item", unit: "EA", quantity: 1 }],
  categoryId: "roofing",
  jobNameOrPo: "Test Job",
};
const validation4 = validateAgentDraftRFQ(draft4);
assert(validation4.ok === true, "PICKUP without deliveryAddress should be ready");
assert(!validation4.missing.includes("deliveryAddress"), "Missing fields should NOT include deliveryAddress");

// Test 5: Complete draft should be ready
console.log("\nTest 5: Complete draft");
const draft5 = {
  fulfillmentType: "DELIVERY",
  deliveryAddress: "123 Main St, Birmingham, AL 35201",
  needBy: "2026-03-01",
  lineItems: [{ description: "Test item", unit: "EA", quantity: 1 }],
  categoryId: "roofing",
  jobNameOrPo: "Test Job",
  visibility: "broadcast",
};
const validation5 = validateAgentDraftRFQ(draft5);
assert(validation5.ok === true, "Complete draft should be ready");
assert(validation5.missing.length === 0, "Missing fields should be empty");

// Test 6: Draft missing other required fields should NOT be ready
console.log("\nTest 6: Draft missing lineItems");
const draft6 = {
  fulfillmentType: "PICKUP",
  needBy: "2026-03-01",
  categoryId: "roofing",
  jobNameOrPo: "Test Job",
  // Missing lineItems
};
const validation6 = validateAgentDraftRFQ(draft6);
assert(validation6.ok === false, "Draft missing lineItems should NOT be ready");
assert(validation6.missing.includes("lineItems"), "Missing fields should include lineItems");

// Test 7: Normalize deliveryAddress (trim whitespace, treat "" as null)
console.log("\nTest 7: Normalize deliveryAddress");
const draft7a = {
  fulfillmentType: "DELIVERY",
  deliveryAddress: "  123 Main St  ",
  needBy: "2026-03-01",
  lineItems: [{ description: "Test item", unit: "EA", quantity: 1 }],
  categoryId: "roofing",
  jobNameOrPo: "Test Job",
};
// validateAgentDraftRFQ trims the address, so this should pass
const validation7a = validateAgentDraftRFQ(draft7a);
assert(validation7a.ok === true, "DELIVERY with trimmed deliveryAddress should be ready");

const draft7b = {
  fulfillmentType: "DELIVERY",
  deliveryAddress: "   ",
  needBy: "2026-03-01",
  lineItems: [{ description: "Test item", unit: "EA", quantity: 1 }],
  categoryId: "roofing",
  jobNameOrPo: "Test Job",
};
const validation7b = validateAgentDraftRFQ(draft7b);
assert(validation7b.ok === false, "DELIVERY with whitespace-only deliveryAddress should NOT be ready");
assert(validation7b.missing.includes("deliveryAddress"), "Missing fields should include deliveryAddress");

console.log("\n✅ All readiness gate tests passed!\n");
console.log("Summary:");
console.log("  - DELIVERY without deliveryAddress: NOT ready, asks for address");
console.log("  - DELIVERY with valid deliveryAddress: ready");
console.log("  - PICKUP without deliveryAddress: ready");
console.log("  - Complete draft: ready");
console.log("  - Draft missing required fields: NOT ready");
console.log("  - deliveryAddress normalization: whitespace trimmed, empty strings treated as missing");

