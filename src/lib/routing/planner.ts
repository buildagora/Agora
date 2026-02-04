/**
 * Routing Planner - Determines how to route an RFQ based on priority and buyer preferences
 * Uses AgentDraftRFQ contract, categoryId only
 */

import type { AgentDraftRFQ } from "@/lib/agent/contracts";
import type { BuyerProfile, Supplier, RoutingPlan } from "./types";
import { getEligibleSuppliers, type EligibilityInput } from "./eligibility";

/**
 * Infer urgency from needBy date
 */
function inferUrgency(needBy?: string): "urgent" | "medium" | "normal" {
  if (!needBy || needBy === "ASAP") return "urgent";
  
  const now = new Date();
  const needed = new Date(needBy);
  const diffDays = Math.ceil((needed.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  
  if (diffDays <= 1) return "urgent"; // today or tomorrow
  if (diffDays <= 3) return "medium"; // 2-3 days
  return "normal"; // >3 days
}

/**
 * Build routing plan for an RFQ
 * Deterministic and unit-testable
 * V1 Foundation: Accepts AgentDraftRFQ, uses categoryId only
 */
export function buildRoutingPlan(
  draft: AgentDraftRFQ,
  buyerProfile: BuyerProfile,
  supplierIndex: Supplier[]
): RoutingPlan {
  // A) Missing required routing inputs
  if (!draft.categoryId || !draft.fulfillmentType) {
    return {
      strategy: "broadcast_category",
      routeMode: "category_broadcast",
      targets: [],
      explainInternal: {
        reason: "Missing categoryId or fulfillmentType, defaulting to broadcast",
      },
    };
  }

  // Create typed EligibilityInput for getEligibleSuppliers
  const eligibilityInput: EligibilityInput = {
    categoryId: draft.categoryId,
    fulfillmentType: draft.fulfillmentType,
    priority: draft.priority === "preferred_only" ? "preferred" : draft.priority === "best_price" ? "best_price" : draft.priority === "urgent" ? "fastest" : "not_sure",
  };

  const priority = draft.priority || "best_price";
  // Map AgentPriority to eligibility intent
  const intent = priority === "preferred_only" ? "preferred" : priority === "best_price" ? "best_price" : "not_sure";
  const eligibilityResult = getEligibleSuppliers(eligibilityInput, buyerProfile, supplierIndex, intent);
  const eligibleSuppliers = eligibilityResult.suppliers;

  // Minimal dev-only logging
  if (process.env.NODE_ENV === "development") {
    console.log("🔍 ROUTING_DEBUG", {
      categoryId: draft.categoryId,
      fulfillmentType: draft.fulfillmentType,
      priority,
      eligibleCount: eligibleSuppliers.length,
      reason: eligibilityResult.reason,
    });
  }

  if (eligibleSuppliers.length === 0) {
    return {
      strategy: "broadcast_category",
      routeMode: "category_broadcast",
      targets: [],
      explainInternal: {
        reason: eligibilityResult.reason || "NO_ELIGIBLE_SUPPLIERS",
        eligibleCount: 0,
        eligibilityDebug: eligibilityResult.eligibilityDebug,
      },
    };
  }

  const urgency = inferUrgency(draft.needBy);

  // Get preferred supplier IDs for this specific categoryId only
  // CRITICAL: Use category-scoped lookup to prevent cross-category routing bugs
  const preferredIdsForCategory = buyerProfile.preferredSuppliersByCategory?.[draft.categoryId] ?? [];
  const preferredSupplierIds = preferredIdsForCategory.filter(id =>
    eligibleSuppliers.some(s => s.id === id)
  );

  // B) BEST PRICE → broadcast to ALL eligible suppliers
  if (priority === "best_price") {
    return {
      strategy: "broadcast_category",
      routeMode: "category_broadcast",
      targets: [], // Empty means "all eligible" - will be populated at dispatch time
      explainInternal: {
        reason: "Best price priority: broadcasting to all eligible suppliers",
        eligibleCount: eligibleSuppliers.length,
      },
    };
  }

  // C) PREFERRED ONLY → route ONLY to preferred suppliers (no silent fallback)
  if (priority === "preferred_only") {
    const eligiblePreferred = eligibleSuppliers.filter((s) =>
      preferredSupplierIds.includes(s.id)
    );

    if (eligiblePreferred.length > 0) {
      return {
        strategy: "preferred_first",
        routeMode: "preferred_only",
        targets: eligiblePreferred.map((s) => s.id),
        explainInternal: {
          reason: "Preferred supplier priority: routing to preferred suppliers only",
          preferredCount: eligiblePreferred.length,
          eligibleCount: eligibleSuppliers.length,
          eligibilityDebug: eligibilityResult.eligibilityDebug,
        },
      };
    }

    // No eligible preferred suppliers - return empty targets
    // UI will handle buyer consent for fallback
    return {
      strategy: "preferred_first",
      routeMode: "preferred_only",
      targets: [],
      explainInternal: {
        reason: preferredSupplierIds.length === 0
          ? "PREFERRED_SUPPLIERS_NOT_SET"
          : "PREFERRED_SUPPLIERS_NOT_ELIGIBLE",
        preferredCount: 0,
        eligibleCount: eligibleSuppliers.length,
        eligibilityDebug: eligibilityResult.eligibilityDebug,
      },
    };
  }

  // D) URGENT priority OR urgent needBy → route to fastest available suppliers
  if (priority === "urgent" || urgency === "urgent") {
    // Sort eligible suppliers by SLA (lower is faster), nulls go last
    const sortedBySLA = [...eligibleSuppliers].sort((a, b) => {
      const aSla = a.slaMinutes ?? null;
      const bSla = b.slaMinutes ?? null;
      if (aSla === null && bSla === null) return 0;
      if (aSla === null) return 1;
      if (bSla === null) return -1;
      return aSla - bSla;
    });

    // Take top 2 fastest suppliers
    const targets = sortedBySLA.slice(0, 2).map((s) => s.id);

    // Route mode: preferred_only if preferred suppliers exist, else category_broadcast
    const routeMode = preferredSupplierIds.length > 0 && targets.some(id => preferredSupplierIds.includes(id))
      ? "preferred_only"
      : "category_broadcast";

    return {
      strategy: "fastest_first",
      routeMode,
      targets,
      explainInternal: {
        reason: "Urgent priority: routing to fastest available suppliers",
        eligibleCount: eligibleSuppliers.length,
      },
    };
  }

  // E) Default fallback: broadcast for best price
  return {
    strategy: "broadcast_category",
    routeMode: "category_broadcast",
    targets: [],
    explainInternal: {
      reason: "Defaulting to broadcast for best price",
      eligibleCount: eligibleSuppliers.length,
    },
  };
}

