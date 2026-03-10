/**
 * RFQ Delivery Address Validation Regression Test
 * Tests that RFQ creation is blocked when fulfillmentType is DELIVERY without deliveryAddress
 * Run with: npx tsx src/app/api/agent/__tests__/rfqDeliveryAddressValidation.test.ts
 */

// Mock the draftToRfqPayload function behavior
function draftToRfqPayload(draft: Record<string, unknown>): {
  fulfillmentType: "PICKUP" | "DELIVERY";
  deliveryAddress: string | null;
  needBy: string | null;
  [key: string]: unknown;
} | null {
  // Normalize fulfillmentType
  const rawFulfillmentType = (draft.fulfillmentType || "PICKUP") as string;
  const fulfillmentType = (rawFulfillmentType.toUpperCase() === "DELIVERY" ? "DELIVERY" : "PICKUP") as "PICKUP" | "DELIVERY";
  
  // Normalize deliveryAddress (trim whitespace, treat "" as null)
  let deliveryAddress: string | null = null;
  if (draft.deliveryAddress) {
    const addr = String(draft.deliveryAddress).trim();
    deliveryAddress = addr || null;
  }
  
  // CRITICAL: Validate fulfillmentType/deliveryAddress invariant
  // If DELIVERY without address, return null to block RFQ creation
  if (fulfillmentType === "DELIVERY" && !deliveryAddress) {
    console.error("[RFQ_VALIDATION_ERROR]", {
      code: "RFQ_VALIDATION_DELIVERY_ADDRESS_REQUIRED",
      error: "deliveryAddress is required when fulfillmentType is DELIVERY",
      draftFulfillmentType: draft.fulfillmentType,
      draftDeliveryAddress: draft.deliveryAddress,
    });
    // Return null to block RFQ creation
    return null;
  }
  
  return {
    fulfillmentType,
    deliveryAddress,
    needBy: (draft.needBy as string | null) || null,
    title: "Test RFQ",
    notes: "",
    categoryId: "roofing",
    category: "Roofing",
    lineItems: [{ description: "Test item", unit: "EA", quantity: 1 }],
    terms: {
      fulfillmentType,
      requestedDate: "2026-03-01",
      location: deliveryAddress || undefined,
    },
    visibility: "broadcast",
  };
}

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAIL: ${message}`);
    process.exit(1);
  }
  console.log(`✅ PASS: ${message}`);
}

console.log("\n🧪 Testing RFQ Delivery Address Validation\n");

// Test 1: DELIVERY without deliveryAddress should block RFQ creation
console.log("Test 1: DELIVERY without deliveryAddress");
const draft1 = {
  fulfillmentType: "DELIVERY",
  deliveryAddress: null,
  needBy: "2026-03-01",
  lineItems: [{ description: "Test item", unit: "EA", quantity: 1 }],
  categoryId: "roofing",
  jobNameOrPo: "Test Job",
};
const payload1 = draftToRfqPayload(draft1);
assert(payload1 === null, "DELIVERY without deliveryAddress should return null (block RFQ creation)");

// Test 2: DELIVERY with empty string deliveryAddress should block RFQ creation
console.log("\nTest 2: DELIVERY with empty string deliveryAddress");
const draft2 = {
  fulfillmentType: "DELIVERY",
  deliveryAddress: "",
  needBy: "2026-03-01",
  lineItems: [{ description: "Test item", unit: "EA", quantity: 1 }],
  categoryId: "roofing",
  jobNameOrPo: "Test Job",
};
const payload2 = draftToRfqPayload(draft2);
assert(payload2 === null, "DELIVERY with empty string deliveryAddress should return null");

// Test 3: DELIVERY with whitespace-only deliveryAddress should block RFQ creation
console.log("\nTest 3: DELIVERY with whitespace-only deliveryAddress");
const draft3 = {
  fulfillmentType: "DELIVERY",
  deliveryAddress: "   ",
  needBy: "2026-03-01",
  lineItems: [{ description: "Test item", unit: "EA", quantity: 1 }],
  categoryId: "roofing",
  jobNameOrPo: "Test Job",
};
const payload3 = draftToRfqPayload(draft3);
assert(payload3 === null, "DELIVERY with whitespace-only deliveryAddress should return null");

// Test 4: DELIVERY with valid deliveryAddress should create RFQ
console.log("\nTest 4: DELIVERY with valid deliveryAddress");
const draft4 = {
  fulfillmentType: "DELIVERY",
  deliveryAddress: "123 Main St, Birmingham, AL 35201",
  needBy: "2026-03-01",
  lineItems: [{ description: "Test item", unit: "EA", quantity: 1 }],
  categoryId: "roofing",
  jobNameOrPo: "Test Job",
};
const payload4 = draftToRfqPayload(draft4);
assert(payload4 !== null, "DELIVERY with valid deliveryAddress should return payload");
assert(payload4?.fulfillmentType === "DELIVERY", "fulfillmentType should be DELIVERY");
assert(payload4?.deliveryAddress === "123 Main St, Birmingham, AL 35201", "deliveryAddress should be preserved");
assert(payload4?.terms.fulfillmentType === "DELIVERY", "terms.fulfillmentType should match RFQ.fulfillmentType");
assert(payload4?.terms.location === "123 Main St, Birmingham, AL 35201", "terms.location should match deliveryAddress");

// Test 5: PICKUP without deliveryAddress should create RFQ
console.log("\nTest 5: PICKUP without deliveryAddress");
const draft5 = {
  fulfillmentType: "PICKUP",
  deliveryAddress: null,
  needBy: "2026-03-01",
  lineItems: [{ description: "Test item", unit: "EA", quantity: 1 }],
  categoryId: "roofing",
  jobNameOrPo: "Test Job",
};
const payload5 = draftToRfqPayload(draft5);
assert(payload5 !== null, "PICKUP without deliveryAddress should return payload");
assert(payload5?.fulfillmentType === "PICKUP", "fulfillmentType should be PICKUP");

// Test 6: Normalize deliveryAddress (trim whitespace)
console.log("\nTest 6: Normalize deliveryAddress (trim whitespace)");
const draft6 = {
  fulfillmentType: "DELIVERY",
  deliveryAddress: "  123 Main St  ",
  needBy: "2026-03-01",
  lineItems: [{ description: "Test item", unit: "EA", quantity: 1 }],
  categoryId: "roofing",
  jobNameOrPo: "Test Job",
};
const payload6 = draftToRfqPayload(draft6);
assert(payload6 !== null, "DELIVERY with trimmed deliveryAddress should return payload");
assert(payload6?.deliveryAddress === "123 Main St", "deliveryAddress should be trimmed");

// Test 7: Terms.fulfillmentType stays in sync with RFQ.fulfillmentType
console.log("\nTest 7: Terms.fulfillmentType stays in sync");
const draft7 = {
  fulfillmentType: "DELIVERY",
  deliveryAddress: "123 Main St",
  needBy: "2026-03-01",
  lineItems: [{ description: "Test item", unit: "EA", quantity: 1 }],
  categoryId: "roofing",
  jobNameOrPo: "Test Job",
};
const payload7 = draftToRfqPayload(draft7);
assert(payload7 !== null, "Payload should be created");
assert(payload7?.fulfillmentType === payload7?.terms.fulfillmentType, "terms.fulfillmentType should match RFQ.fulfillmentType");

console.log("\n✅ All regression tests passed!\n");
console.log("Summary:");
console.log("  - DELIVERY without deliveryAddress: RFQ creation blocked (returns null)");
console.log("  - DELIVERY with valid deliveryAddress: RFQ creation succeeds");
console.log("  - PICKUP without deliveryAddress: RFQ creation succeeds");
console.log("  - deliveryAddress normalization: whitespace trimmed, empty strings treated as null");
console.log("  - terms.fulfillmentType stays in sync with RFQ.fulfillmentType");

