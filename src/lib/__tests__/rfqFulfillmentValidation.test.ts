/**
 * RFQ Fulfillment Validation Regression Tests
 * Tests that DELIVERY cannot be persisted without deliveryAddress
 * Run with: npx tsx src/lib/__tests__/rfqFulfillmentValidation.test.ts
 */

import { applyNormalizedPatch, validateFulfillmentInvariant } from "../rfqDraftCanonical";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAIL: ${message}`);
    process.exit(1);
  }
  console.log(`✅ PASS: ${message}`);
}

console.log("\n🧪 Testing RFQ Fulfillment Validation\n");

// Test validateFulfillmentInvariant
console.log("Testing validateFulfillmentInvariant:");

// Test 1: DELIVERY without address should fail
const invalidDraft1 = {
  fulfillmentType: "DELIVERY",
  deliveryAddress: null,
};
const error1 = validateFulfillmentInvariant(invalidDraft1);
assert(error1 !== null, "DELIVERY without deliveryAddress should return error");
assert(error1?.code === "RFQ_VALIDATION_DELIVERY_ADDRESS_REQUIRED", "Error code should be RFQ_VALIDATION_DELIVERY_ADDRESS_REQUIRED");

// Test 2: DELIVERY with empty string should fail
const invalidDraft2 = {
  fulfillmentType: "DELIVERY",
  deliveryAddress: "",
};
const error2 = validateFulfillmentInvariant(invalidDraft2);
assert(error2 !== null, "DELIVERY with empty deliveryAddress should return error");

// Test 3: DELIVERY with whitespace-only address should fail
const invalidDraft3 = {
  fulfillmentType: "DELIVERY",
  deliveryAddress: "   ",
};
const error3 = validateFulfillmentInvariant(invalidDraft3);
assert(error3 !== null, "DELIVERY with whitespace-only deliveryAddress should return error");

// Test 4: DELIVERY with valid address should pass
const validDraft1 = {
  fulfillmentType: "DELIVERY",
  deliveryAddress: "123 Main St, Birmingham, AL 35201",
};
const error4 = validateFulfillmentInvariant(validDraft1);
assert(error4 === null, "DELIVERY with valid deliveryAddress should pass");

// Test 5: PICKUP without address should pass
const validDraft2 = {
  fulfillmentType: "PICKUP",
  deliveryAddress: null,
};
const error5 = validateFulfillmentInvariant(validDraft2);
assert(error5 === null, "PICKUP without deliveryAddress should pass");

// Test 6: PICKUP with address should pass
const validDraft3 = {
  fulfillmentType: "PICKUP",
  deliveryAddress: "123 Main St",
};
const error6 = validateFulfillmentInvariant(validDraft3);
assert(error6 === null, "PICKUP with deliveryAddress should pass");

// Test applyNormalizedPatch
console.log("\nTesting applyNormalizedPatch:");

// Test 7: Applying DELIVERY without address should reject DELIVERY
const draft7 = {
  fulfillmentType: "PICKUP",
  deliveryAddress: null,
};
const patch7 = {
  fulfillmentType: "DELIVERY",
  deliveryAddress: null,
};
const merged7 = applyNormalizedPatch(draft7, patch7);
assert(merged7.fulfillmentType === "PICKUP", "Applying DELIVERY without address should keep previous PICKUP");

// Test 8: Applying DELIVERY with address should accept DELIVERY
const draft8 = {
  fulfillmentType: "PICKUP",
  deliveryAddress: null,
};
const patch8 = {
  fulfillmentType: "DELIVERY",
  deliveryAddress: "123 Main St, Birmingham, AL 35201",
};
const merged8 = applyNormalizedPatch(draft8, patch8);
assert(merged8.fulfillmentType === "DELIVERY", "Applying DELIVERY with address should accept DELIVERY");
assert(merged8.deliveryAddress === "123 Main St, Birmingham, AL 35201", "deliveryAddress should be preserved");

// Test 9: Normalize deliveryAddress (trim whitespace, treat "" as null)
const draft9 = {
  fulfillmentType: "DELIVERY",
  deliveryAddress: "  123 Main St  ",
};
const patch9 = {};
const merged9 = applyNormalizedPatch(draft9, patch9);
assert(merged9.deliveryAddress === "123 Main St", "deliveryAddress should be trimmed");

// Test 10: Empty string deliveryAddress should be removed
const draft10 = {
  fulfillmentType: "PICKUP",
  deliveryAddress: "",
};
const patch10 = {};
const merged10 = applyNormalizedPatch(draft10, patch10);
assert(merged10.deliveryAddress === undefined, "Empty string deliveryAddress should be removed");

// Test 11: Changing from DELIVERY to PICKUP should work
const draft11 = {
  fulfillmentType: "DELIVERY",
  deliveryAddress: "123 Main St",
};
const patch11 = {
  fulfillmentType: "PICKUP",
};
const merged11 = applyNormalizedPatch(draft11, patch11);
assert(merged11.fulfillmentType === "PICKUP", "Changing from DELIVERY to PICKUP should work");

// Test 12: Removing deliveryAddress while DELIVERY should downgrade to PICKUP
const draft12 = {
  fulfillmentType: "DELIVERY",
  deliveryAddress: "123 Main St",
};
const patch12 = {
  deliveryAddress: null,
};
const merged12 = applyNormalizedPatch(draft12, patch12);
assert(merged12.fulfillmentType === undefined || merged12.fulfillmentType === "PICKUP", 
  "Removing deliveryAddress while DELIVERY should remove or downgrade fulfillmentType");

console.log("\n✅ All tests passed!\n");



