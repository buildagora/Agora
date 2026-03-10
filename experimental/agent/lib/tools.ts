/**
 * Agent Tool Layer
 * Server-side tool implementations for agent actions
 * All tools return deterministic { ok, data?, error? } and never throw unless fatal
 */

import "server-only";
import type { AgentDraftRFQ } from "./contracts";
import { agentDraftToCreatePayload } from "./translator";
import { categoryIdToLabel, type CategoryId } from "../categoryIds";
import { Prisma } from "@prisma/client";

/**
 * Tool result type
 */
export type ToolResult<T = any> =
  | { ok: true; data: T }
  | { ok: false; error: string };

/**
 * Update draft with patch
 */
export async function toolUpdateDraft(args: {
  draft: Partial<AgentDraftRFQ>;
  patch: Partial<AgentDraftRFQ>;
}): Promise<ToolResult<Partial<AgentDraftRFQ>>> {
  try {
    const updated = { ...args.draft, ...args.patch };
    return { ok: true, data: updated };
  } catch (error: any) {
    return { ok: false, error: error.message || "Failed to update draft" };
  }
}

/**
 * Create RFQ from draft
 */
export async function toolCreateRFQ(args: {
  draft: AgentDraftRFQ;
  buyerId: string;
  buyerContext?: { userId: string; email?: string; name?: string };
}): Promise<ToolResult<{ id: string; rfqId: string; rfqNumber: string; buyerId: string }>> {
  try {
    // CRITICAL: Validate required fields (canonical contract)
    if (!args.draft.categoryId) {
      return { ok: false, error: "Missing required field: categoryId" };
    }
    if (!args.draft.lineItems || args.draft.lineItems.length === 0) {
      return { ok: false, error: "Missing required field: lineItems" };
    }

    // Extract canonical fields directly from draft (not from payload.terms)
    const fulfillmentType = (args.draft.fulfillmentType || "PICKUP").toUpperCase() as "PICKUP" | "DELIVERY";
    
    // Extract deliveryAddress: normalize (trim whitespace, treat "" as null)
    let deliveryAddress: string | null = null;
    if (args.draft.deliveryAddress) {
      const addr = String(args.draft.deliveryAddress).trim();
      deliveryAddress = addr || null;
    }
    
    // Extract needBy: accept "ASAP" or YYYY-MM-DD
    let needBy: string | null = null;
    if (args.draft.needBy) {
      if (args.draft.needBy === "ASAP" || args.draft.needBy.toUpperCase() === "ASAP") {
        needBy = "ASAP";
      } else if (/^\d{4}-\d{2}-\d{2}$/.test(args.draft.needBy)) {
        needBy = args.draft.needBy;
      }
    }

    // CRITICAL: Enforce invariant - DELIVERY requires non-empty deliveryAddress
    if (fulfillmentType === "DELIVERY" && !deliveryAddress) {
      return {
        ok: false,
        error: "RFQ_VALIDATION_DELIVERY_ADDRESS_REQUIRED: deliveryAddress is required when fulfillmentType is DELIVERY",
      };
    }

    // Convert draft to payload (for terms and other fields)
    const payload = agentDraftToCreatePayload(args.draft, args.buyerId);

    // CRITICAL: Ensure terms.fulfillmentType matches top-level fulfillmentType (canonical)
    const termsForDb = {
      ...payload.terms,
      fulfillmentType, // Override to match top-level field
    };

    // Server-side: Import API logic directly instead of HTTP call
    const { getPrisma } = await import("../db.server");
    const prisma = getPrisma();

    // Generate RFQ number (canonical logic - remove legacy "RQ-" handling)
    const existingRFQs = await prisma.rFQ.findMany({
      where: { buyerId: args.buyerId },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    const currentYear = new Date().getFullYear();
    const yearPrefix = currentYear.toString().slice(-2);
    let maxNumber = 0;
    for (const rfq of existingRFQs) {
      if (rfq.rfqNumber?.startsWith(`RFQ-${yearPrefix}-`)) {
        const numberPart = rfq.rfqNumber.split("-")[2];
        const num = parseInt(numberPart, 10);
        if (!isNaN(num) && num > maxNumber) {
          maxNumber = num;
        }
      }
    }
    const rfqNumber = `RFQ-${yearPrefix}-${(maxNumber + 1).toString().padStart(4, "0")}`;

    // CRITICAL: Default status to OPEN (canonical contract)
    const rfqStatus = payload.status || "OPEN";

    // Extract jobNameOrPo from draft (persist separately)
    const jobNameOrPo = args.draft.jobNameOrPo && args.draft.jobNameOrPo.trim().length > 0
      ? args.draft.jobNameOrPo.trim()
      : payload.title;

    // Get category label
    const categoryLabel = payload.category || categoryIdToLabel[args.draft.categoryId as CategoryId] || args.draft.categoryId;

    // Create RFQ in database (canonical contract)
    let created;
    try {
      created = await prisma.rFQ.create({
        data: {
          id: payload.id || crypto.randomUUID(),
          rfqNumber,
          status: rfqStatus,
          title: payload.title,
          notes: payload.notes?.trim() ?? "",
          category: categoryLabel,
          categoryId: args.draft.categoryId, // CRITICAL: Canonical categoryId (required)
          jobNameOrPo: jobNameOrPo, // CRITICAL: Persist jobNameOrPo separately
          buyer: { connect: { id: args.buyerId } },
          lineItems: JSON.stringify(payload.lineItems),
          terms: JSON.stringify(termsForDb), // Use normalized terms with consistent fulfillmentType
          visibility: payload.visibility || "broadcast",
          targetSupplierIds: payload.targetSupplierIds 
            ? JSON.stringify(payload.targetSupplierIds) 
            : null,
          fulfillmentType, // Top-level column (canonical source)
          deliveryAddress, // Top-level column
          needBy, // Top-level column
          createdAt: payload.createdAt ? new Date(payload.createdAt) : new Date(),
        },
      });
    } catch (error) {
      // Check for CHECK constraint violation: rfq_delivery_requires_address
      const isConstraintViolation = 
        (error instanceof Prisma.PrismaClientKnownRequestError && 
         error.code === "P2004" &&
         (error.meta?.constraint === "rfq_delivery_requires_address" || 
          String(error.meta?.target || "").includes("rfq_delivery_requires_address"))) ||
        ((error as any).code === "23514") ||
        (error instanceof Error && error.message.includes("rfq_delivery_requires_address"));
      
      if (isConstraintViolation) {
        console.error("[RFQ_CREATE_CONSTRAINT_VIOLATION]", {
          constraint: "rfq_delivery_requires_address",
          fulfillmentType,
          deliveryAddress: deliveryAddress ? "present" : "missing",
          buyerId: args.buyerId,
        });
        return {
          ok: false,
          error: "RFQ_VALIDATION_DELIVERY_ADDRESS_REQUIRED: deliveryAddress is required when fulfillmentType is DELIVERY",
        };
      }
      
      // Re-throw other errors
      throw error;
    }

    // CRITICAL: Log DB creation success
    console.log("[RFQ_CREATE_DB_OK]", {
      id: created.id,
      rfqNumber: created.rfqNumber,
      buyerId: created.buyerId,
    });

    return {
      ok: true,
      data: {
        id: created.id,
        rfqId: created.id,
        rfqNumber: created.rfqNumber,
        buyerId: created.buyerId,
      },
    };
  } catch (error: any) {
    return { ok: false, error: error.message || "Failed to create RFQ" };
  }
}

/**
 * Get preferred suppliers for buyer and category
 */
export async function toolGetPreferredSuppliers(args: {
  buyerId: string;
  categoryId: string;
}): Promise<ToolResult<Array<{ id: string; name?: string; email?: string }>>> {
  try {
    if (!args.buyerId || !args.categoryId) {
      return { ok: false, error: "buyerId and categoryId required" };
    }

    // TODO: Replace with API call to /api/buyer/preferred-suppliers?categoryId=...
    // For now, return empty array deterministically (no legacy preferredSuppliers module)
    const suppliers: Array<{ id: string; name?: string; email?: string }> = [];

    return { ok: true, data: suppliers };
  } catch (error: any) {
    return { ok: false, error: error.message || "Failed to get preferred suppliers" };
  }
}

/**
 * Discover suppliers for category and location
 */
export async function toolDiscoverSuppliers(args: {
  categoryId: string;
  location?: string;
  fulfillmentType?: "PICKUP" | "DELIVERY";
}): Promise<ToolResult<Array<{ id: string; name?: string; email?: string; companyName?: string }>>> {
  try {
    if (!args.categoryId) {
      return { ok: false, error: "categoryId required" };
    }

    // TODO: Replace with API call to /api/suppliers
    // Removed storage dependency
    const allStorageSuppliers: any[] = [];
    // categoryId is already in canonical form, no conversion needed

    const categoryLabel =
      args.categoryId ? categoryIdToLabel[args.categoryId as CategoryId] : "";

    // Filter by category
    const matching = allStorageSuppliers.filter((s: any) => {
      if (s.unsubscribed) return false; // Inactive
      const matchesCategory = s.categoryIds?.includes(args.categoryId) || 
                              s.categories?.includes(categoryLabel || "");
      if (!matchesCategory) return false;

      // Note: StorageSupplier doesn't have supportsDelivery/supportsPickup
      // For now, assume all suppliers support both
      return true;
    });

    const suppliers = matching.map((s: any) => ({
      id: s.id,
      name: s.name,
      email: s.email,
      companyName: s.companyName,
    }));

    return { ok: true, data: suppliers };
  } catch (error: any) {
    return { ok: false, error: error.message || "Failed to discover suppliers" };
  }
}

/**
 * Launch reverse auction (for now, just creates RFQ with broadcast visibility)
 */
export async function toolLaunchAuction(args: {
  rfqId: string;
  buyerId: string;
  supplierIds?: string[];
}): Promise<ToolResult<{ rfqId: string; supplierCount: number }>> {
  try {
    if (!args.rfqId || !args.buyerId) {
      return { ok: false, error: "rfqId and buyerId required" };
    }

    // RFQ lookup should use API - /api/buyer/rfqs/[id]
    // For now, assume RFQ exists if rfqId is provided
    // In a full implementation, this would fetch from API

    // For now, launching auction means ensuring RFQ is visible in feed
    // In a full implementation, this would trigger notifications to suppliers
    // For MVP, RFQ is already in feed if visibility is broadcast

    const supplierCount = args.supplierIds?.length || 0;

    if (process.env.NODE_ENV === "development") {
      console.log("🔨 AUCTION_LAUNCHED", { rfqId: args.rfqId, supplierCount });
    }

    return { ok: true, data: { rfqId: args.rfqId, supplierCount } };
  } catch (error: any) {
    return { ok: false, error: error.message || "Failed to launch auction" };
  }
}

/**
 * Create order from RFQ and supplier
 */
export async function toolCreateOrder(args: {
  rfqId: string;
  supplierId: string;
  buyerId: string;
}): Promise<ToolResult<{ orderId: string; rfqId: string; supplierId: string }>> {
  try {
    if (!args.rfqId || !args.supplierId || !args.buyerId) {
      return { ok: false, error: "rfqId, supplierId, and buyerId required" };
    }

    // RFQ lookup should use API - /api/buyer/rfqs/[id]
    // For now, assume RFQ exists if rfqId is provided
    // In a full implementation, this would fetch from API

    // Find bid for this supplier
    // TODO: Replace with API call to /api/seller/bids
    const allBids: any[] = [];
    const bid = allBids.find((b: any) => b.rfqId === args.rfqId && b.sellerId === args.supplierId);

    if (!bid) {
      return { ok: false, error: "No bid found for this supplier" };
    }

    // Create order (simplified - in production would use order creation function)
    const orderId = `order-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    if (process.env.NODE_ENV === "development") {
      console.log("📦 ORDER_CREATED", { orderId, rfqId: args.rfqId, supplierId: args.supplierId });
    }

    return { ok: true, data: { orderId, rfqId: args.rfqId, supplierId: args.supplierId } };
  } catch (error: any) {
    return { ok: false, error: error.message || "Failed to create order" };
  }
}

/**
 * Lookup RFQ or order status
 */
export async function toolLookupStatus(args: {
  type: "rfq" | "order";
  id: string;
  buyerId: string;
}): Promise<ToolResult<{ id: string; status: string; details?: any }>> {
  try {
    if (!args.id || !args.buyerId) {
      return { ok: false, error: "id and buyerId required" };
    }

    if (args.type === "rfq") {
      // RFQ lookup must use API - /api/buyer/rfqs/[id]
      // This tool cannot access RFQ data without API call
      return { ok: false, error: "RFQ lookup must use API endpoint /api/buyer/rfqs/[id]" };
    } else {
      // Order lookup (simplified)
      // TODO: Replace with API call to /api/buyer/orders
      const allOrders: any[] = [];
      const order = allOrders.find((o: any) => o.id === args.id && o.buyerId === args.buyerId);

      if (!order) {
        return { ok: false, error: "Order not found" };
      }

      return {
        ok: true,
        data: {
          id: order.id,
          status: order.status || "unknown",
          details: order,
        },
      };
    }
  } catch (error: any) {
    return { ok: false, error: error.message || "Failed to lookup status" };
  }
}
