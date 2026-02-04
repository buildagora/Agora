/**
 * Test script for Agent Contract validation
 * Run with: npm run test:agent-contract
 */

/* eslint-disable @typescript-eslint/no-var-requires */

// Setup mocks before importing modules
const mockLocalStorage = new Map<string, string>();
const mockSessionStorage = new Map<string, string>();

// Mock browser globals (Node.js doesn't have these)
(global as any).window = global;
(global as any).localStorage = {
  getItem: (k: string) => mockLocalStorage.get(k) ?? null,
  setItem: (k: string, v: string) => void mockLocalStorage.set(k, v),
  removeItem: (k: string) => void mockLocalStorage.delete(k),
  clear: () => mockLocalStorage.clear(),
  get length() { return mockLocalStorage.size; },
  key: (index: number) => Array.from(mockLocalStorage.keys())[index] || null,
};

(global as any).sessionStorage = {
  getItem: (k: string) => mockSessionStorage.get(k) ?? null,
  setItem: (k: string, v: string) => void mockSessionStorage.set(k, v),
  removeItem: (k: string) => void mockSessionStorage.delete(k),
  clear: () => mockSessionStorage.clear(),
  get length() { return mockSessionStorage.size; },
  key: (index: number) => Array.from(mockSessionStorage.keys())[index] || null,
};

// Mock crypto for UUID generation
(global as any).crypto = {
  randomUUID: () => {
    return `test-uuid-${Math.random().toString(36).substring(2, 15)}`;
  },
};

// Now import modules
import { validateAgentDraftRFQ } from "../src/lib/agent/contracts";
import { normalizeCategoryInput } from "../src/lib/categories";
import type { AgentDraftRFQ } from "../src/lib/agent/contracts";

let testsPassed = 0;
let testsFailed = 0;

function test(name: string, fn: () => boolean | void) {
  try {
    const result = fn();
    if (result === false) {
      console.error(`❌ FAIL: ${name}`);
      testsFailed++;
    } else {
      console.log(`✅ PASS: ${name}`);
      testsPassed++;
    }
  } catch (error) {
    console.error(`❌ FAIL: ${name}`, error);
    testsFailed++;
  }
}

console.log("🧪 Testing Agent Contract...\n");

// Test 1: Valid PICKUP roofing draft with 1 line item passes
test("Valid PICKUP roofing draft passes validation", () => {
  const draft: AgentDraftRFQ = {
    jobNameOrPo: "Test Job",
    categoryId: "roofing",
    fulfillmentType: "PICKUP",
    lineItems: [
      {
        description: "Shingles",
        quantity: 10,
        unit: "bundles",
      },
    ],
    priority: "best_price",
    visibility: "broadcast",
    createdFrom: "agent",
  };

  const result = validateAgentDraftRFQ(draft);
  if (!result.ok) {
    console.error("Validation missing fields:", result.missing);
    return false;
  }
  return true;
});

// Test 2: DELIVERY without address fails with correct error
test("DELIVERY without address fails validation", () => {
  const draft: Partial<AgentDraftRFQ> = {
    jobNameOrPo: "Test Job",
    categoryId: "roofing",
    fulfillmentType: "DELIVERY",
    lineItems: [
      {
        description: "Shingles",
        quantity: 10,
      },
    ],
    priority: "best_price",
    visibility: "broadcast",
    createdFrom: "agent",
  };

  const result = validateAgentDraftRFQ(draft);
  if (result.ok) {
    console.error("Expected validation to fail for DELIVERY without address");
    return false;
  }

  const hasDeliveryAddressError = result.missing.includes("deliveryAddress");
  if (!hasDeliveryAddressError) {
    console.error("Expected deliveryAddress in missing fields, got:", result.missing);
    return false;
  }
  return true;
});

// Test 3: Direct visibility without targetSupplierIds fails
test("Direct visibility without targetSupplierIds fails validation", () => {
  const draft: Partial<AgentDraftRFQ> = {
    jobNameOrPo: "Test Job",
    categoryId: "roofing",
    fulfillmentType: "PICKUP",
    lineItems: [
      {
        description: "Shingles",
        quantity: 10,
      },
    ],
    priority: "preferred_only",
    visibility: "direct",
    createdFrom: "agent",
  };

  const result = validateAgentDraftRFQ(draft);
  if (result.ok) {
    console.error("Expected validation to fail for direct visibility without targetSupplierIds");
    return false;
  }

  const hasTargetSupplierIdsError = result.missing.includes("targetSupplierIds");
  if (!hasTargetSupplierIdsError) {
    console.error("Expected targetSupplierIds in missing fields, got:", result.missing);
    return false;
  }
  return true;
});

// Test 4: normalizeCategoryInput handles "rofing" -> roofing with confidence fuzzy
test("normalizeCategoryInput handles typo 'rofing' -> roofing with fuzzy confidence", () => {
  const result = normalizeCategoryInput("rofing");
  
  if (result.categoryId !== "roofing") {
    console.error(`Expected categoryId 'roofing', got '${result.categoryId}'`);
    return false;
  }
  
  if (result.confidence !== "fuzzy") {
    console.error(`Expected confidence 'fuzzy', got '${result.confidence}'`);
    return false;
  }
  
  if (result.normalized !== "Roofing") {
    console.error(`Expected normalized 'Roofing', got '${result.normalized}'`);
    return false;
  }
  
  return true;
});

// Test 5: normalizeCategoryInput handles exact match
test("normalizeCategoryInput handles exact match", () => {
  const result = normalizeCategoryInput("Roofing");
  
  if (result.categoryId !== "roofing") {
    console.error(`Expected categoryId 'roofing', got '${result.categoryId}'`);
    return false;
  }
  
  if (result.confidence !== "exact") {
    console.error(`Expected confidence 'exact', got '${result.confidence}'`);
    return false;
  }
  
  return true;
});

// Test 6: normalizeCategoryInput handles alias
test("normalizeCategoryInput handles alias 'mechanical' -> hvac", () => {
  const result = normalizeCategoryInput("mechanical");
  
  if (result.categoryId !== "hvac") {
    console.error(`Expected categoryId 'hvac', got '${result.categoryId}'`);
    return false;
  }
  
  if (result.confidence !== "alias") {
    console.error(`Expected confidence 'alias', got '${result.confidence}'`);
    return false;
  }
  
  return true;
});

// Test 7: validateAgentDraftRFQ rejects empty jobNameOrPo
test("validateAgentDraftRFQ rejects empty jobNameOrPo", () => {
  const draft: Partial<AgentDraftRFQ> = {
    jobNameOrPo: "",
    categoryId: "roofing",
    fulfillmentType: "PICKUP",
    lineItems: [
      {
        description: "Shingles",
        quantity: 10,
      },
    ],
    priority: "best_price",
    visibility: "broadcast",
    createdFrom: "agent",
  };

  const result = validateAgentDraftRFQ(draft);
  if (result.ok) {
    console.error("Expected validation to fail for empty jobNameOrPo");
    return false;
  }

  const hasJobNameError = result.missing.includes("jobNameOrPo");
  if (!hasJobNameError) {
    console.error("Expected jobNameOrPo in missing fields, got:", result.missing);
    return false;
  }
  return true;
});

// Test 8: validateAgentDraftRFQ rejects empty lineItems
test("validateAgentDraftRFQ rejects empty lineItems", () => {
  const draft: Partial<AgentDraftRFQ> = {
    jobNameOrPo: "Test Job",
    categoryId: "roofing",
    fulfillmentType: "PICKUP",
    lineItems: [],
    priority: "best_price",
    visibility: "broadcast",
    createdFrom: "agent",
  };

  const result = validateAgentDraftRFQ(draft);
  if (result.ok) {
    console.error("Expected validation to fail for empty lineItems");
    return false;
  }

  const hasLineItemsError = result.missing.includes("lineItems");
  if (!hasLineItemsError) {
    console.error("Expected lineItems in missing fields, got:", result.missing);
    return false;
  }
  return true;
});

// Summary
console.log(`\n📊 Test Summary:`);
console.log(`   Passed: ${testsPassed}`);
console.log(`   Failed: ${testsFailed}`);

if (testsFailed > 0) {
  console.error(`\n❌ ${testsFailed} test(s) failed`);
  process.exit(1);
} else {
  console.log(`\n✅ All ${testsPassed} test(s) passed`);
  process.exit(0);
}


