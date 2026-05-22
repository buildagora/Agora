import { NextRequest } from "next/server";
import { createPurchaseOrderDraft } from "@/lib/procurement/createPurchaseOrder";
import type { PurchaseOrderSourceType } from "@/lib/procurement/types";
import { jsonError, jsonOk, withErrorHandling } from "@/lib/apiResponse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SOURCE_TYPES = new Set<PurchaseOrderSourceType>(["LISTING", "MANUAL", "HYBRID"]);

type DraftBody = {
  materialRequestId?: string;
  conversationId?: string | null;
  sourceType?: string;
  originalSearchText?: string;
  productName?: string;
  sourceListingUrl?: string | null;
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ requestId: string; supplierId: string }> },
) {
  return withErrorHandling(async () => {
    const { requestId, supplierId } = await params;
    if (!requestId?.trim() || !supplierId?.trim()) {
      return jsonError("BAD_REQUEST", "requestId and supplierId are required", 400);
    }

    let body: DraftBody;
    try {
      body = (await request.json()) as DraftBody;
    } catch {
      return jsonError("BAD_REQUEST", "Invalid JSON", 400);
    }

    const materialRequestId = body.materialRequestId?.trim();
    if (!materialRequestId || materialRequestId !== requestId.trim()) {
      return jsonError("BAD_REQUEST", "materialRequestId must match request", 400);
    }

    const sourceType = body.sourceType?.trim() as PurchaseOrderSourceType | undefined;
    if (!sourceType || !SOURCE_TYPES.has(sourceType)) {
      return jsonError("BAD_REQUEST", "Invalid sourceType", 400);
    }

    const originalSearchText = body.originalSearchText?.trim();
    const productName = body.productName?.trim();
    if (!originalSearchText || !productName) {
      return jsonError("BAD_REQUEST", "originalSearchText and productName are required", 400);
    }

    const result = await createPurchaseOrderDraft({
      supplierId: supplierId.trim(),
      materialRequestId,
      conversationId: body.conversationId?.trim() || null,
      sourceType,
      notes: null,
      items: [
        {
          originalSearchText,
          productName,
          sourceListingUrl: body.sourceListingUrl?.trim() || null,
          quantity: null,
          unit: null,
          buyerConfirmedSpecs: false,
        },
      ],
    });

    return jsonOk({ purchaseOrderId: result.purchaseOrderId });
  });
}
