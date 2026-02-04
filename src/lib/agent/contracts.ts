/**
 * Agent Contract for Draft RFQs (V1)
 * Canonical types and validators for agent-generated RFQ drafts
 */

import type { CategoryId } from "../categories";

/**
 * Fulfillment type for RFQ
 */
export type FulfillmentType = "PICKUP" | "DELIVERY";

/**
 * Agent priority/routing strategy
 */
export type AgentPriority = "best_price" | "urgent" | "preferred_only";

/**
 * RFQ visibility mode
 */
export type RFQVisibility = "broadcast" | "direct";

/**
 * Line item in agent draft RFQ
 */
export interface AgentLineItem {
  description: string;
  quantity: number;
  unit?: string;
}

/**
 * Agent-generated draft RFQ
 * This is the canonical contract for agent-created RFQs
 */
export interface AgentDraftRFQ {
  jobNameOrPo: string;
  categoryId: CategoryId;
  categoryLabel?: string; // Derived display only
  fulfillmentType: FulfillmentType;
  deliveryAddress?: string;
  lineItems: AgentLineItem[];
  needBy?: string | "ASAP"; // ISO date string or "ASAP"
  notes?: string; // Must default undefined/blank; NEVER auto-populate
  priority: AgentPriority;
  visibility: RFQVisibility;
  targetSupplierIds?: string[];
  createdFrom: "agent";
  expectedField?: "lineItems" | "fulfillment" | "neededBy" | "jobNameOrPo" | null; // A1: Single key for what field we're currently collecting
  conversationMode?: "advice" | "procurement"; // Foundation Fix #2: Track conversation mode
  __lastAskedSlot?: string; // Foundation Fix #2: Track last slot asked (jobNameOrPo, lineItems, fulfillmentType, neededBy, etc.)
}

/**
 * Validation result for agent draft RFQ
 * SINGLE SOURCE OF TRUTH: Simplified to only check jobNameOrPo and lineItems
 */
export type ValidationResult = {
  ok: boolean;
  missing: string[];
};

/**
 * Validate agent draft RFQ against contract requirements
 * B: Make validation match what UI actually requires (ONE gate)
 * 
 * Required fields:
 * 1. categoryId or categoryLabel - required (API needs category string)
 * 2. jobNameOrPo (or jobName/poNumber/po) - required
 * 3. lineItems - at least 1 with quantity > 0, uom, and description/SKU/name
 * 4. neededBy - required (if your flow asks for it)
 */
export function validateAgentDraftRFQ(draft: any): ValidationResult {
  const missing: string[] = [];

  // Extract category (required for API)
  const categoryId = draft?.categoryId;
  const categoryLabel = draft?.categoryLabel;
  const hasCategory = !!(categoryId || categoryLabel);

  // Extract jobNameOrPo from various possible field names
  const jobNameOrPo = (
    draft?.jobNameOrPo ?? 
    draft?.jobName ?? 
    draft?.poNumber ?? 
    draft?.po ?? 
    ""
  ).toString().trim();

  // Extract neededBy (prefer canonical needBy, fallback to legacy requestedDate for compatibility)
  const neededBy = (
    draft?.needBy ?? 
    draft?.neededBy ?? 
    draft?.requestedDate ?? 
    ""
  ).toString().trim();

  // Extract lineItems array
  const items = Array.isArray(draft?.lineItems) ? draft.lineItems : [];

  // Check category (CRITICAL: API requires this)
  if (!hasCategory) {
    missing.push("categoryId");
  }

  // Check jobNameOrPo
  if (!jobNameOrPo) {
    missing.push("jobNameOrPo");
  }

  // Check neededBy
  if (!neededBy) {
    missing.push("neededBy");
  }

  // Check lineItems
  if (items.length === 0) {
    missing.push("lineItems");
  } else {
    // Check if any item is invalid (missing qty, uom, or description)
    const bad = items.some((li: any) => {
      const qtyOk = typeof li?.quantity === "number" && li.quantity > 0;
      const uomOk = !!(li?.uom?.toString().trim() || li?.unit?.toString().trim());
      const descOk = !!(
        li?.sku?.toString().trim() || 
        li?.description?.toString().trim() || 
        li?.name?.toString().trim()
      );
      return !(qtyOk && uomOk && descOk);
    });
    if (bad) {
      missing.push("lineItems");
    }
  }

  // Stable order, de-dupe
  const seen = new Set<string>();
  const stable = missing.filter((m) => (seen.has(m) ? false : (seen.add(m), true)));

  return { ok: stable.length === 0, missing: stable };
}
