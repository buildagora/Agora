/**
 * RFQ Dispatch - Orchestrates RFQ creation, routing, and supplier notification
 * V1 Foundation: API-backed persistence, no localStorage, no require()
 * 
 * BANNED: normalizeCategory, CANONICAL_CATEGORIES, require(), saveRfqs, RFQS_KEY, getRfqs, generateRFQNumber
 * RFQ id is created by API during persistence. Client must NOT require draft.id.
 * Routing MUST use CategoryId only. Category labels are display-only.
 */

// Agent types moved to experimental/agent/lib - commenting out to prevent build errors
// import type { AgentDraftRFQ, AgentPriority } from "@/lib/agent/contracts";
// TODO: Re-enable when agent is reintroduced
type AgentDraftRFQ = any;
type AgentPriority = any;
import type { DraftRFQ, Category } from "@/lib/routing/types";
import { getEligibleSuppliers, type EligibilityInput } from "@/lib/routing/eligibility";
import { buildRoutingPlan } from "@/lib/routing/planner";
import { dispatchRFQ } from "@/lib/routing/dispatcher";
import { fetchJson } from "@/lib/clientFetch";
import { categoryIdToLabel, labelToCategoryId, type CategoryId } from "@/lib/categoryIds";

/**
 * Type guard: validates that a string is a valid CategoryId
 */
function isCategoryId(x: string): x is CategoryId {
  return x in categoryIdToLabel;
}

/**
 * Map routing priority to agent priority
 */
function mapPriorityToAgentPriority(
  priority?: "fastest" | "best_price" | "preferred" | "not_sure"
): AgentPriority {
  if (priority === "fastest") return "urgent";
  if (priority === "best_price") return "best_price";
  if (priority === "preferred") return "preferred_only";
  return "best_price"; // Default to best_price for "not_sure"
}

/**
 * Adapter: Convert DraftRFQ to AgentDraftRFQ for planner
 * No casting, explicit mapping
 */
function adaptDraftToAgentDraft(draft: DraftRFQ, categoryId: CategoryId): AgentDraftRFQ {
  return {
    jobNameOrPo: draft.jobNameOrPo || draft.title || "",
    categoryId,
    fulfillmentType: draft.fulfillmentType!,
    lineItems: (draft.lineItems || []).map(item => ({
      description: item.description,
      quantity: item.quantity,
      unit: item.unit,
    })),
    needBy: draft.requestedDate,
    notes: draft.notes,
    priority: mapPriorityToAgentPriority(draft.priority),
    visibility: "broadcast",
    createdFrom: "agent",
  };
}

/**
 * Send RFQ to suppliers
 * Orchestrates: routing plan → API persistence → dispatch
 */
export async function sendRfqToSuppliers(
  draft: DraftRFQ,
  userId: string
): Promise<{
  ok: boolean;
  code?: string;
  buyerMessage?: string;
  rfqId?: string;
  rfqNumber?: string;
  supplierCount?: number;
  sent?: number;
  skipped?: number;
  errors?: number;
  debug?: any;
}> {
  // Validate required fields
  if (!draft.categoryId && !draft.category) {
    return {
      ok: false,
      code: "MISSING_CATEGORY",
      buyerMessage: "Category is required",
    };
  }

  // Resolve categoryId with validation using type guard (no unsafe casts)
  let categoryId: CategoryId | null = null;
  
  // Validate draft.categoryId if present using type guard
  if (draft.categoryId && isCategoryId(draft.categoryId)) {
    categoryId = draft.categoryId;
  }
  // Else, try to resolve from draft.category label
  else if (draft.category) {
    const resolvedId = labelToCategoryId[draft.category as keyof typeof labelToCategoryId];
    if (resolvedId && isCategoryId(resolvedId)) {
      categoryId = resolvedId;
    }
  }

  if (!categoryId) {
    return {
      ok: false,
      code: "MISSING_CATEGORY",
      buyerMessage: "Category is required",
    };
  }

  // Validate fulfillmentType
  if (!draft.fulfillmentType) {
    return {
      ok: false,
      code: "MISSING_FULFILLMENT_TYPE",
      buyerMessage: "Fulfillment type (pickup or delivery) is required",
    };
  }

  // Validate lineItems
  if (!draft.lineItems || draft.lineItems.length === 0) {
    return {
      ok: false,
      code: "MISSING_LINE_ITEMS",
      buyerMessage: "At least one line item is required",
    };
  }

  // Get routing dependencies from database (server-side)
  const { getBuyerProfileFromDb, getSupplierIndexFromDb } = await import("./routing/adapters.server");
  const buyerProfile = await getBuyerProfileFromDb(userId);
  const supplierIndex = await getSupplierIndexFromDb();

  // Build routing plan (requires AgentDraftRFQ)
  const agentDraftForPlanner = adaptDraftToAgentDraft(draft, categoryId);
  const plan = buildRoutingPlan(agentDraftForPlanner, buyerProfile, supplierIndex);

  // Preferred-only guardrail: if preferred_only with 0 targets, return error
  if (plan.routeMode === "preferred_only" && plan.targets.length === 0) {
    return {
      ok: false,
      code: "NO_SUPPLIERS",
      buyerMessage: "No preferred suppliers are available for this category. Would you like to send to all suppliers in this category instead?",
      debug: plan.explainInternal,
    };
  }

  // Get eligible suppliers for count (used in response)
  const eligibilityInput: EligibilityInput = {
    categoryId,
    fulfillmentType: draft.fulfillmentType!,
    location: draft.location,
    priority: draft.priority,
  };
  const eligibilityResult = getEligibleSuppliers(
    eligibilityInput,
    buyerProfile,
    supplierIndex,
    draft.priority === "preferred" ? "preferred" : draft.priority === "best_price" ? "best_price" : draft.priority === "fastest" ? "fastest" : "not_sure"
  );

  // Determine visibility from routing plan
  const visibility = plan.routeMode === "preferred_only" && plan.targets.length > 0
    ? "direct"
    : "broadcast";

  // Build API payload (matches RFQPayloadSchema)
  const categoryLabel: Category = categoryIdToLabel[categoryId] as Category;
  const apiPayload = {
    title: draft.jobNameOrPo || draft.title || "Material Request",
    notes: draft.notes || "",
    category: categoryLabel, // Display label (required by API schema)
    categoryId: categoryId, // Canonical categoryId (required for routing)
    lineItems: draft.lineItems.map(item => ({
      description: item.description,
      unit: item.unit,
      quantity: item.quantity,
    })),
    terms: {
      fulfillmentType: draft.fulfillmentType,
      requestedDate: draft.requestedDate || new Date().toISOString().split("T")[0],
      ...(draft.fulfillmentType === "DELIVERY" && draft.location && {
        location: draft.location,
      }),
    },
    visibility,
    ...(visibility === "direct" && plan.targets.length > 0 && {
      targetSupplierIds: plan.targets,
    }),
  };

  // CRITICAL: Single creation step - POST /api/buyer/rfqs
  // All RFQ IDs and numbers are generated server-side. No local creation.
  const apiResponse = await fetchJson("/api/buyer/rfqs", {
    method: "POST",
    body: JSON.stringify({
      buyerId: userId,
      payload: apiPayload,
    }),
  });

  // If API fails, return error immediately - do NOT dispatch
  if (!apiResponse.ok || !apiResponse.json) {
    return {
      ok: false,
      code: "PERSISTENCE_ERROR",
      buyerMessage: "Failed to save request. Please try again.",
    };
  }

  // Extract RFQ data from API response (handle both ok/data and direct response shapes)
  const apiResult = apiResponse.json;
  const rfqData = apiResult?.data ?? apiResult;

  // Use ONLY API-returned values (no local generation)
  const persistedRfqId = rfqData?.rfqId ?? rfqData?.id;
  const persistedRfqNumber = rfqData?.rfqNumber;

  // Validate API returned required fields
  if (!persistedRfqId) {
    return {
      ok: false,
      code: "PERSISTENCE_ERROR",
      buyerMessage: "Failed to save request. Please try again.",
    };
  }

  if (!persistedRfqNumber) {
    return {
      ok: false,
      code: "PERSISTENCE_ERROR",
      buyerMessage: "Request saved but missing RFQ number. Please contact support.",
    };
  }

  // Create dispatch-ready draft using ONLY API-returned ID
  const draftWithCategoryId: DraftRFQ = {
    ...draft,
    id: persistedRfqId, // API-returned ID only
    categoryId,
    category: categoryLabel,
  };

  // Dispatch using API-returned RFQ ID
  const dispatchStats = await dispatchRFQ(
    draftWithCategoryId,
    plan,
    buyerProfile,
    supplierIndex
  );

  // Return success result
  return {
    ok: true,
    rfqId: persistedRfqId,
    rfqNumber: persistedRfqNumber,
    supplierCount: eligibilityResult.suppliers.length,
    sent: dispatchStats.sent,
    skipped: dispatchStats.skipped,
    errors: dispatchStats.errors,
  };
}
