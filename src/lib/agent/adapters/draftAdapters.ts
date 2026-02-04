/**
 * Draft Adapters - Legacy name adapters for external contracts
 * 
 * These adapters are the ONLY place where legacy names (requestedDate, location, category)
 * are allowed IF external types still require them.
 * 
 * Canonical draft uses: needBy, deliveryAddress, categoryLabel/categoryId
 */

import type { ThreadDraft } from "@/lib/agentThreads";
import type { DraftRFQ as ExecutionPanelDraftRFQ } from "@/lib/agent/draftBuilder";
import type { DraftRFQ as RoutingDraftRFQ } from "@/lib/routing/types";
import { categoryIdToLabel } from "@/lib/categoryIds";
// normalizeCategory removed - use categoryIdToLabel directly

/**
 * Adapter: Convert canonical ThreadDraft to ExecutionPanel DraftRFQ contract
 * 
 * ExecutionPanel expects: category, requestedDate, location (legacy names)
 * This adapter maps canonical keys to legacy names ONLY for the ExecutionPanel contract
 */
export function canonicalDraftToExecutionPanelDraft(
  canonicalDraft: ThreadDraft | null,
  threadId: string | null
): ExecutionPanelDraftRFQ | null {
  if (!canonicalDraft || Object.keys(canonicalDraft).length === 0) {
    return null;
  }

  const categoryLabel =
    canonicalDraft.categoryLabel ||
    (canonicalDraft.categoryId ? categoryIdToLabel(canonicalDraft.categoryId) : "") ||
    "Materials";

  return {
    id: threadId || crypto.randomUUID(),
    status: "draft" as const,
    title: canonicalDraft.jobNameOrPo || categoryLabel || "Material Request",
    category: categoryLabel, // Legacy name for ExecutionPanel
    fulfillmentType: canonicalDraft.fulfillmentType || "DELIVERY",
    requestedDate: canonicalDraft.needBy || new Date().toISOString().split("T")[0], // Legacy name
    location: canonicalDraft.deliveryAddress, // Legacy name
    lineItems: canonicalDraft.lineItems || [],
    notes: canonicalDraft.notes,
    jobNameOrPo: canonicalDraft.jobNameOrPo || "",
    urgency: "normal" as const,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Adapter: Convert canonical ThreadDraft to Routing DraftRFQ contract
 * 
 * Routing expects: category, requestedDate, location (legacy names)
 * This adapter maps canonical keys to legacy names ONLY for the routing/dispatch contract
 */
export function canonicalDraftToRoutingDraft(
  canonicalDraft: ThreadDraft | null,
  draftId: string
): RoutingDraftRFQ {
  if (!canonicalDraft) {
    return {
      id: draftId,
      title: "",
      category: undefined,
      categoryId: undefined,
      fulfillmentType: undefined,
      requestedDate: undefined,
      location: undefined,
      priority: undefined,
      notes: undefined,
      jobNameOrPo: undefined,
      lineItems: undefined,
    };
  }

  const categoryId = canonicalDraft.categoryId;
  const categoryLabel = canonicalDraft.categoryLabel;

  return {
    id: draftId,
    title: canonicalDraft.jobNameOrPo || "",
    category: categoryLabel || undefined, // Use categoryLabel directly
    categoryId: categoryId || undefined,
    fulfillmentType: canonicalDraft.fulfillmentType,
    requestedDate: canonicalDraft.needBy || "", // Legacy name
    location: canonicalDraft.deliveryAddress, // Legacy name
    priority: canonicalDraft.priority,
    notes: canonicalDraft.notes || "",
    jobNameOrPo: canonicalDraft.jobNameOrPo || "",
    lineItems: canonicalDraft.lineItems || [],
  };
}

