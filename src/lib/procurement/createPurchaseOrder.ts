import { getPrisma } from "@/lib/db.server";
import type {
  CreatePurchaseOrderDraftInput,
  CreatePurchaseOrderDraftResult,
} from "./types";

/**
 * Creates a DRAFT purchase order with line items.
 * Foundational procurement intent only — no auth, messaging, or checkout yet.
 */
export async function createPurchaseOrderDraft(
  args: CreatePurchaseOrderDraftInput,
): Promise<CreatePurchaseOrderDraftResult> {
  const supplierId = args.supplierId?.trim();
  if (!supplierId) {
    throw new Error("supplierId is required");
  }

  const sourceType = args.sourceType?.trim();
  if (!sourceType) {
    throw new Error("sourceType is required");
  }

  if (!args.items?.length) {
    throw new Error("At least one item is required");
  }

  for (const item of args.items) {
    if (!item.originalSearchText?.trim()) {
      throw new Error("Each item must include originalSearchText");
    }
    if (!item.productName?.trim()) {
      throw new Error("Each item must include productName");
    }
  }

  const prisma = getPrisma();

  const purchaseOrder = await prisma.purchaseOrder.create({
    data: {
      supplierId,
      materialRequestId: args.materialRequestId ?? null,
      conversationId: args.conversationId ?? null,
      sourceType,
      notes: args.notes?.trim() || null,
      status: "DRAFT",
      items: {
        create: args.items.map((item) => ({
          originalSearchText: item.originalSearchText.trim(),
          productName: item.productName.trim(),
          manufacturer: item.manufacturer?.trim() || null,
          sku: item.sku?.trim() || null,
          quantity: item.quantity ?? null,
          unit: item.unit?.trim() || null,
          buyerConfirmedSpecs: item.buyerConfirmedSpecs ?? false,
          sourceListingUrl: item.sourceListingUrl?.trim() || null,
          confidenceScore: item.confidenceScore ?? null,
        })),
      },
    },
    select: { id: true },
  });

  return { purchaseOrderId: purchaseOrder.id };
}
