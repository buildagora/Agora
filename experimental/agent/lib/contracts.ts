/**
 * Agent Contract for Draft RFQs (V1)
 * Canonical types and validators for agent-generated RFQ drafts
 */

import type { CategoryId } from "../categoryIds";

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
}

/**
 * Validation result for agent draft RFQ
 */
export type ValidationResult = {
  ok: boolean;
  missing: string[];
};

/**
 * Validate agent draft RFQ against contract requirements
 *
 * CONTRACT GATE (matches scripts/test-agent-contract.ts):
 * Required ALWAYS:
 * - categoryId (or categoryLabel as fallback)
 * - jobNameOrPo (or jobName/poNumber/po fallbacks)
 * - fulfillmentType ("PICKUP" | "DELIVERY")
 * - lineItems: >= 1 item with quantity > 0 AND a description/name/sku (unit is OPTIONAL)
 *
 * Required CONDITIONALLY:
 * - if fulfillmentType === "DELIVERY": deliveryAddress is required
 * - if visibility === "direct": targetSupplierIds must be a non-empty array
 *
 * NOT REQUIRED here (collected during conversation; must not gate contract validation):
 * - needBy
 * - notes
 * - priority
 */
export function validateAgentDraftRFQ(draft: any): ValidationResult {
  const missing: string[] = [];

  // Category (required for RFQ creation)
  const categoryId = typeof draft?.categoryId === "string" ? draft.categoryId.trim() : "";
  const categoryLabel = typeof draft?.categoryLabel === "string" ? draft.categoryLabel.trim() : "";
  const hasCategory = Boolean(categoryId || categoryLabel);
  if (!hasCategory) missing.push("categoryId");

  // jobNameOrPo (required)
  const jobNameOrPo = (
    draft?.jobNameOrPo ??
    draft?.jobName ??
    draft?.poNumber ??
    draft?.po ??
    ""
  ).toString().trim();
  if (!jobNameOrPo) missing.push("jobNameOrPo");

  // fulfillmentType (required)
  const fulfillmentType = (draft?.fulfillmentType ?? "").toString().toUpperCase();
  const isPickup = fulfillmentType === "PICKUP";
  const isDelivery = fulfillmentType === "DELIVERY";
  if (!isPickup && !isDelivery) missing.push("fulfillmentType");

  // lineItems (required; unit optional)
  const items = Array.isArray(draft?.lineItems) ? draft.lineItems : [];
  if (items.length === 0) {
    missing.push("lineItems");
  } else {
    const bad = items.some((li: any) => {
      const qtyOk = typeof li?.quantity === "number" && li.quantity > 0;
      const descOk = Boolean(
        li?.sku?.toString().trim() ||
          li?.description?.toString().trim() ||
          li?.name?.toString().trim()
      );
      return !(qtyOk && descOk);
    });
    if (bad) missing.push("lineItems");
  }

  // deliveryAddress only required for DELIVERY
  if (isDelivery) {
    const deliveryAddress = (draft?.deliveryAddress ?? "").toString().trim();
    if (!deliveryAddress) missing.push("deliveryAddress");
  }

  // targetSupplierIds only required for direct visibility
  const visibility = (draft?.visibility ?? "").toString();
  if (visibility === "direct") {
    const ids = draft?.targetSupplierIds;
    const ok = Array.isArray(ids) && ids.filter((x: any) => typeof x === "string" && x.trim()).length > 0;
    if (!ok) missing.push("targetSupplierIds");
  }

  // Stable order + de-dupe
  const seen = new Set<string>();
  const stable = missing.filter((m) => (seen.has(m) ? false : (seen.add(m), true)));

  return { ok: stable.length === 0, missing: stable };
}
