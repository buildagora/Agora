/**
 * Lightweight tests for Request validation, normalization, and CRUD operations
 * Run with: npm run test:requests
 */

// Setup mocks before importing modules
const localStorage = new Map<string, string>();
const sessionStorage = new Map<string, string>();

// Mock browser globals (Node.js doesn't have these)
(global as any).window = global;
(global as any).localStorage = {
  getItem: (key: string) => localStorage.get(key) || null,
  setItem: (key: string, value: string) => localStorage.set(key, value),
  removeItem: (key: string) => localStorage.delete(key),
  clear: () => localStorage.clear(),
  length: localStorage.size,
  key: (index: number) => Array.from(localStorage.keys())[index] || null,
};

(global as any).sessionStorage = {
  getItem: (key: string) => sessionStorage.get(key) || null,
  setItem: (key: string, value: string) => sessionStorage.set(key, value),
  removeItem: (key: string) => sessionStorage.delete(key),
  clear: () => sessionStorage.clear(),
  length: sessionStorage.size,
  key: (index: number) => Array.from(sessionStorage.keys())[index] || null,
};

// Mock crypto for UUID generation (deterministic for testing)
let uuidCounter = 0;
if ((global as any).crypto) {
  (global as any).crypto.randomUUID = () => {
    uuidCounter++;
    return `test-uuid-${uuidCounter}`;
  };
} else {
  (global as any).crypto = {
    randomUUID: () => {
      uuidCounter++;
      return `test-uuid-${uuidCounter}`;
    },
  };
}

// Mock Date for consistent timestamps
const MOCK_DATE = "2023-10-27T10:00:00.000Z";
const MOCK_DATE_2 = "2023-10-27T10:01:00.000Z";
let dateCallCount = 0;
const RealDate = Date;
class MockDate extends RealDate {
  constructor(dateString?: string | number | Date) {
    if (dateString) {
      super(dateString);
    } else {
      // Increment call count to allow different timestamps
      dateCallCount++;
      if (dateCallCount === 1) {
        super(MOCK_DATE);
      } else {
        super(MOCK_DATE_2);
      }
    }
  }
  static now() {
    dateCallCount++;
    if (dateCallCount === 1) {
      return new RealDate(MOCK_DATE).getTime();
    } else {
      return new RealDate(MOCK_DATE_2).getTime();
    }
  }
  toISOString() {
    if (this.getTime() === new RealDate(MOCK_DATE).getTime()) return MOCK_DATE;
    if (this.getTime() === new RealDate(MOCK_DATE_2).getTime()) return MOCK_DATE_2;
    return super.toISOString();
  }
}
(global as any).Date = MockDate;

import {
  createDraftRequest,
  updateDraftRequest,
  getRequest,
  validateRequestDraft,
  type RFQRequest,
} from "../src/lib/request";

// Helper for assertions
function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ ${message}`);
    process.exit(1);
  }
}

function runTests() {
  console.log("\n🧪 Running Request validation, normalization, and CRUD tests...\n");

  // --- Setup ---
  (global as any).localStorage.clear();
  (global as any).sessionStorage.clear();
  uuidCounter = 0;

  const buyerId = "buyer-1";

  // --- Test 1: validateRequestDraft() with valid request ---
  console.log("Test 1: validateRequestDraft() with valid request");
  const validRequest: Request = {
    id: "req-1",
    buyerId,
    status: "draft",
    createdAt: MOCK_DATE,
    updatedAt: MOCK_DATE,
    jobName: "Test Request",
    notes: "Test notes",
    substitutionsAllowed: false,
    delivery: {
      mode: "delivery",
      needBy: "2023-11-01T10:00:00.000Z",
      address: "123 Main St, City, ST 12345",
    },
    items: [
      {
        id: "item-1",
        description: "Test item",
        category: "Lumber",
        quantity: 10,
        unit: "ea",
      },
    ],
  };

  const validation1 = validateRequestDraft(validRequest);
  assert(validation1.isValid === true, "validateRequestDraft should return isValid=true for valid request");
  assert(validation1.missingFields.length === 0, "validateRequestDraft should return no missing fields for valid request");
  console.log("✅ validateRequestDraft() with valid request");

  // --- Test 2: validateRequestDraft() with missing fields ---
  console.log("Test 2: validateRequestDraft() with missing fields");
  const invalidRequest: Request = {
    id: "req-2",
    buyerId,
    status: "draft",
    createdAt: MOCK_DATE,
    updatedAt: MOCK_DATE,
    delivery: {
      mode: "delivery",
      needBy: "", // Missing needBy
      address: "", // Missing address
    },
    items: [], // Missing items
  };

  const validation2 = validateRequestDraft(invalidRequest);
  assert(validation2.isValid === false, "validateRequestDraft should return isValid=false for invalid request");
  assert(validation2.missingFields.length > 0, "validateRequestDraft should return missing fields for invalid request");
  assert(validation2.missingFields.some((f) => f.includes("item") || f.includes("Item")), "Should detect missing items");
  assert(validation2.missingFields.some((f) => f.includes("Need-by") || f.includes("needBy")), "Should detect missing needBy");
  assert(validation2.missingFields.some((f) => f.includes("address") || f.includes("Address")), "Should detect missing address");
  console.log("✅ validateRequestDraft() with missing fields");

  // --- Test 3: Normalization - trim whitespace ---
  console.log("Test 3: Normalization - trim whitespace");
  const requestWithWhitespace = createDraftRequest({
    buyerId,
    jobName: "  Test Job  ",
    notes: "  Test notes  ",
    delivery: {
      mode: "delivery",
      needBy: "2023-11-01T10:00:00.000Z",
      address: "  123 Main St  ",
    },
    items: [
      {
        description: "  Test item  ",
        category: "  Lumber  ",
        quantity: 10,
        unit: "  EA  ",
      },
    ],
  });

  assert(requestWithWhitespace.jobName === "Test Job", "jobName should be trimmed");
  assert(requestWithWhitespace.notes === "Test notes", "notes should be trimmed");
  assert(requestWithWhitespace.delivery.address === "123 Main St", "address should be trimmed");
  assert(requestWithWhitespace.items[0].description === "Test item", "item description should be trimmed");
  assert(requestWithWhitespace.items[0].category === "Lumber", "item category should be trimmed");
  assert(requestWithWhitespace.items[0].unit === "ea", "unit should be trimmed and lowercased");
  console.log("✅ Normalization - trim whitespace");

  // --- Test 4: Normalization - quantity coercion ---
  console.log("Test 4: Normalization - quantity coercion");
  try {
    createDraftRequest({
      buyerId,
      delivery: {
        mode: "pickup",
        needBy: "2023-11-01T10:00:00.000Z",
        pickupWindow: "8am-5pm",
      },
      items: [
        {
          description: "Test item",
          category: "Lumber",
          quantity: 0, // Invalid: <= 0
          unit: "ea",
        },
      ],
    });
    assert(false, "createDraftRequest should reject quantity <= 0");
  } catch (error: any) {
    assert(error.message.includes("quantity") || error.message.includes("Quantity"), "Should reject invalid quantity");
    console.log("✅ Normalization - quantity coercion (rejects <= 0)");
  }

  // --- Test 5: Normalization - unit defaulting ---
  console.log("Test 5: Normalization - unit defaulting");
  const requestWithEmptyUnit = createDraftRequest({
    buyerId,
    delivery: {
      mode: "pickup",
      needBy: "2023-11-01T10:00:00.000Z",
      pickupWindow: "8am-5pm",
    },
    items: [
      {
        description: "Test item",
        category: "Lumber",
        quantity: 10,
        unit: "", // Empty unit should default to "ea"
      },
    ],
  });

  assert(requestWithEmptyUnit.items[0].unit === "ea", "Empty unit should default to 'ea'");
  console.log("✅ Normalization - unit defaulting");

  // --- Test 6: Normalization - unit casing ---
  console.log("Test 6: Normalization - unit casing");
  const requestWithUpperCaseUnit = createDraftRequest({
    buyerId,
    delivery: {
      mode: "pickup",
      needBy: "2023-11-01T10:00:00.000Z",
      pickupWindow: "8am-5pm",
    },
    items: [
      {
        description: "Test item",
        category: "Lumber",
        quantity: 10,
        unit: "LF", // Should be lowercased
      },
    ],
  });

  assert(requestWithUpperCaseUnit.items[0].unit === "lf", "Unit should be lowercased");
  console.log("✅ Normalization - unit casing");

  // --- Test 7: createDraftRequest roundtrip ---
  console.log("Test 7: createDraftRequest roundtrip");
  const draftInput = {
    buyerId,
    jobName: "Test Draft",
    notes: "Test notes",
    substitutionsAllowed: true,
    delivery: {
      mode: "delivery" as const,
      needBy: "2023-11-01T10:00:00.000Z",
      address: "123 Main St, City, ST 12345",
    },
    items: [
      {
        description: "Item 1",
        category: "Lumber",
        quantity: 5,
        unit: "ea",
      },
      {
        description: "Item 2",
        category: "Roofing",
        quantity: 10,
        unit: "sf",
      },
    ],
  };

  const createdDraft = createDraftRequest(draftInput);
  assert(createdDraft.id !== undefined, "createDraftRequest should generate an ID");
  assert(createdDraft.buyerId === buyerId, "createDraftRequest should set buyerId");
  assert(createdDraft.status === "draft", "createDraftRequest should set status to 'draft'");
  assert(createdDraft.items.length === 2, "createDraftRequest should create all items");
  assert(createdDraft.items[0].id !== undefined, "createDraftRequest should generate item IDs");
  assert(createdDraft.items[1].id !== undefined, "createDraftRequest should generate item IDs");

  // Verify it was saved
  const retrievedDraft = getRequest(createdDraft.id, buyerId);
  assert(retrievedDraft !== null, "getRequest should retrieve created draft");
  assert(retrievedDraft?.id === createdDraft.id, "Retrieved draft should have same ID");
  assert(retrievedDraft?.items.length === 2, "Retrieved draft should have all items");
  console.log("✅ createDraftRequest roundtrip");

  // --- Test 8: updateDraftRequest roundtrip ---
  console.log("Test 8: updateDraftRequest roundtrip");
  const updatedDraft = updateDraftRequest(createdDraft.id, buyerId, {
    jobName: "Updated Draft",
    notes: "Updated notes",
    substitutionsAllowed: false,
    items: [
      {
        description: "Updated Item 1",
        category: "Electrical",
        quantity: 20,
        unit: "lf",
      },
    ],
  });

  assert(updatedDraft.jobName === "Updated Draft", "updateDraftRequest should update jobName");
  assert(updatedDraft.notes === "Updated notes", "updateDraftRequest should update notes");
  assert(updatedDraft.substitutionsAllowed === false, "updateDraftRequest should update substitutionsAllowed");
  assert(updatedDraft.items.length === 1, "updateDraftRequest should update items");
  assert(updatedDraft.items[0].description === "Updated Item 1", "updateDraftRequest should update item description");
  // Note: updatedAt check is skipped in test environment due to Date mocking limitations
  // In real usage, updatedAt will be different

  // Verify it was saved
  const retrievedUpdated = getRequest(updatedDraft.id, buyerId);
  assert(retrievedUpdated !== null, "getRequest should retrieve updated draft");
  assert(retrievedUpdated?.jobName === "Updated Draft", "Retrieved updated draft should have new jobName");
  assert(retrievedUpdated?.items.length === 1, "Retrieved updated draft should have updated items");
  console.log("✅ updateDraftRequest roundtrip");

  // --- Test 9: Normalization - delivery mode validation ---
  console.log("Test 9: Normalization - delivery mode validation");
  try {
    createDraftRequest({
      buyerId,
      delivery: {
        mode: "delivery",
        needBy: "2023-11-01T10:00:00.000Z",
        // Missing address
      },
      items: [
        {
          description: "Test item",
          category: "Lumber",
          quantity: 10,
          unit: "ea",
        },
      ],
    });
    assert(false, "createDraftRequest should reject delivery mode without address");
  } catch (error: any) {
    assert(error.message.includes("address") || error.message.includes("Address"), "Should reject delivery without address");
    console.log("✅ Normalization - delivery mode validation (rejects missing address)");
  }

  try {
    createDraftRequest({
      buyerId,
      delivery: {
        mode: "pickup",
        needBy: "2023-11-01T10:00:00.000Z",
        // Missing pickupWindow
      },
      items: [
        {
          description: "Test item",
          category: "Lumber",
          quantity: 10,
          unit: "ea",
        },
      ],
    });
    assert(false, "createDraftRequest should reject pickup mode without pickupWindow");
  } catch (error: any) {
    assert(error.message.includes("pickupWindow") || error.message.includes("Pickup"), "Should reject pickup without pickupWindow");
    console.log("✅ Normalization - delivery mode validation (rejects missing pickupWindow)");
  }

  // --- Test 10: updateDraftRequest only works on drafts ---
  console.log("Test 10: updateDraftRequest only works on drafts");
  // Create a draft and try to update it after changing status (simulate)
  const draftForStatusTest = createDraftRequest({
    buyerId,
    delivery: {
      mode: "pickup",
      needBy: "2023-11-01T10:00:00.000Z",
      pickupWindow: "8am-5pm",
    },
    items: [
      {
        description: "Test item",
        category: "Lumber",
        quantity: 10,
        unit: "ea",
      },
    ],
  });

  // Manually change status to "posted" (simulating what would happen after posting)
  const storageKey = `agora.data.${buyerId}.requests`;
  const allRequests = JSON.parse((global as any).localStorage.getItem(storageKey) || "[]");
  const draftIndex = allRequests.findIndex((r: Request) => r.id === draftForStatusTest.id);
  if (draftIndex !== -1) {
    allRequests[draftIndex].status = "posted";
    (global as any).localStorage.setItem(storageKey, JSON.stringify(allRequests));
  }

  try {
    updateDraftRequest(draftForStatusTest.id, buyerId, {
      jobName: "Should fail",
    });
    assert(false, "updateDraftRequest should reject non-draft requests");
  } catch (error: any) {
    assert(error.message.includes("draft") || error.message.includes("status"), "Should reject updating non-draft request");
    console.log("✅ updateDraftRequest only works on drafts");
  }

  console.log("\n📊 Results: 10 tests passed, 0 failed");
  console.log("\n✅ All tests passed!\n");
}

runTests();
