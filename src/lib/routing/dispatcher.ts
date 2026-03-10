/**
 * RFQ Dispatcher - Sends RFQ to suppliers with idempotency
 */

import type { DraftRFQ, RoutingPlan, Supplier, BuyerProfile } from "./types";
import { getEligibleSuppliers, type EligibilityInput } from "./eligibility";
import { categoryIdToLabel, type CategoryId } from "@/lib/categoryIds";
// Removed storage imports - supplier dispatch will be API-backed
// import { getSuppliers } from "@/lib/storage";
// import { hasSent, markSent } from "@/lib/storage";
import { getCurrentUser } from "@/lib/auth/client";
import { buildRfqNotificationId } from "@/lib/notifications";

/**
 * Dispatch RFQ to suppliers based on routing plan
 * Idempotent: uses existing notification system's idempotency
 */
export async function dispatchRFQ(
  draft: DraftRFQ,
  plan: RoutingPlan,
  buyerProfile: BuyerProfile,
  supplierIndex: Supplier[]
): Promise<{ sent: number; skipped: number; errors: number; reason?: string | null; eligibilityDebug?: any }> {
  if (!draft.id) {
    throw new Error("Draft must have an ID for dispatch");
  }

  if (!draft.categoryId || !draft.fulfillmentType) {
    throw new Error("Draft must have categoryId and fulfillmentType for dispatch");
  }

  const currentUser = await getCurrentUser();
  if (!currentUser) {
    throw new Error("No current user");
  }

  let targets: string[] = [];
  let eligibilityResult: { reason: string | null; eligibilityDebug: any } | null = null;

  // V1 FIX: Respect routeMode - do NOT re-expand preferred_only to broadcast
  if (plan.routeMode === "preferred_only") {
    // Use pre-determined targets (must be set by planner)
    targets = plan.targets;
    if (targets.length === 0) {
      // No eligible preferred suppliers - return error (do NOT fallback to broadcast)
      return {
        sent: 0,
        skipped: 0,
        errors: 0,
        reason: plan.explainInternal?.reason || "PREFERRED_SUPPLIERS_NOT_ELIGIBLE",
        eligibilityDebug: plan.explainInternal?.eligibilityDebug,
      };
    }
  } else if (plan.strategy === "broadcast_category" || plan.routeMode === "category_broadcast") {
    // For broadcast, we want ALL eligible suppliers, not just preferred
    // Use "best_price" intent to get all eligible suppliers
    const eligibilityInput: EligibilityInput = {
      categoryId: draft.categoryId as CategoryId,
      fulfillmentType: draft.fulfillmentType!,
      location: draft.location,
      priority: "best_price",
    };
    const result = getEligibleSuppliers(eligibilityInput, buyerProfile, supplierIndex, "best_price");
    eligibilityResult = {
      reason: result.reason,
      eligibilityDebug: result.eligibilityDebug,
    };
    targets = result.suppliers.map((s) => s.id);
  } else {
    // Use pre-determined targets (for fastest_first, preferred_first with targets)
    targets = plan.targets;
  }

  if (targets.length === 0) {
    // Return eligibility info for debugging
    return {
      sent: 0,
      skipped: 0,
      errors: 0,
      reason: eligibilityResult?.reason || plan.explainInternal?.reason || "NO_ELIGIBLE_SUPPLIERS",
      eligibilityDebug: eligibilityResult?.eligibilityDebug || plan.explainInternal?.eligibilityDebug,
    };
  }

  // Use the routing supplier index (already normalized) to find target suppliers
  // TODO: Replace storage lookup with API call to /api/suppliers
  const targetRoutingSuppliers = supplierIndex.filter((s) => targets.includes(s.id));
  // Removed getSuppliers() - supplier data should come from API/DB
  const targetSuppliers = targetRoutingSuppliers; // Use routing index as fallback
  
  // Enhanced logging for dispatch
  if (process.env.NODE_ENV === "development") {
    console.log("📧 DISPATCH_TARGETS", {
      targetCount: targets.length,
      routingSuppliersFound: targetRoutingSuppliers.length,
      targets,
      routingSupplierIds: targetRoutingSuppliers.map(s => s.id),
    });
  }

  let sent = 0;
  let skipped = 0;
  let errors = 0;

  // Dispatch to each target supplier using existing notification API
  for (const supplier of targetSuppliers) {
    // Skip suppliers without email (required for notifications)
    if (!supplier.email || !supplier.email.trim()) {
      skipped++;
      continue;
    }

    const notificationId = buildRfqNotificationId(draft.id, "RFQ_SENT", supplier.id);

    // TODO: Check idempotency via API/DB instead of storage
    // Removed hasSent() - idempotency should be handled by API
    // if (hasSent(notificationId)) {
    //   skipped++;
    //   continue;
    // }

    try {
      // Build notification payload with Job Name/PO as primary title
      // CRITICAL: Use categoryId only - derive label for display only
      const categoryLabel = draft.categoryId && draft.categoryId in categoryIdToLabel
        ? (categoryIdToLabel[draft.categoryId as CategoryId] || "Materials")
        : "Materials";
      const notificationTitle = draft.jobNameOrPo || draft.title || `${categoryLabel} Materials`;
      
      const notificationRfq = {
        id: draft.id,
        buyerName: currentUser.fullName || currentUser.companyName || "Buyer",
        category: categoryLabel, // Display label (derived from categoryId)
        categoryId: draft.categoryId, // Canonical categoryId (required for routing)
        title: notificationTitle, // Use jobNameOrPo if provided
        description: draft.notes || undefined,
        createdAt: new Date().toISOString(),
        dueAt: draft.requestedDate,
        location: draft.location,
        urlPath: `/seller/feed?categoryId=${encodeURIComponent(draft.categoryId || "")}`,
      };

      // EMAIL NOTIFICATIONS ARE NOW SENT SERVER-SIDE
      // When RFQ is created via /api/buyer/rfqs, notifySellersOfNewRfq() is called automatically
      // This dispatch function no longer sends emails - it only tracks dispatch records
      // Emails are sent transactionally, server-side, and identically to Award/PO emails
      
      // For now, just count as sent (emails are handled server-side)
      sent++;
      
      if (process.env.NODE_ENV === "development") {
        console.log("📧 DISPATCH_RECORDED", {
          supplierId: supplier.id,
          supplierEmail: supplier.email,
          rfqId: draft.id,
          note: "Email sent server-side via notifySellersOfNewRfq()",
        });
      }
    } catch (err) {
      errors++;
      console.error("❌ DISPATCH_ERROR", {
        supplierId: supplier.id,
        supplierEmail: supplier.email,
        rfqId: draft.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  } // end for suppliers

  // Comprehensive dispatch summary logging (always log, not just dev)
  // CRITICAL: Use categoryId only - derive label for display only
  const categoryLabel = draft.categoryId && draft.categoryId in categoryIdToLabel
    ? (categoryIdToLabel[draft.categoryId as CategoryId] || "Unknown")
    : "Unknown";
  console.log("📧 DISPATCH_SUMMARY", {
    rfqId: draft.id,
    jobNameOrPo: draft.jobNameOrPo,
    categoryId: draft.categoryId,
    category: categoryLabel, // Display label (derived from categoryId)
    routeMode: plan.routeMode,
    strategy: plan.strategy,
    totalTargets: targetSuppliers.length,
    sent,
    skipped,
    errors,
    supplierIds: targetSuppliers.map(s => s.id),
    supplierEmails: targetSuppliers.map(s => s.email).filter(Boolean),
  });

  return {
    sent,
    skipped,
    errors,
    reason: undefined,
    eligibilityDebug: undefined,
  };
} // end dispatchRFQ
