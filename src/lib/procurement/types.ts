export type PurchaseOrderSourceType = "LISTING" | "MANUAL" | "HYBRID";

export type CreatePurchaseOrderItemInput = {
  originalSearchText: string;
  productName: string;
  manufacturer?: string | null;
  sku?: string | null;
  quantity?: number | null;
  unit?: string | null;
  buyerConfirmedSpecs?: boolean;
  sourceListingUrl?: string | null;
  confidenceScore?: number | null;
};

export type CreatePurchaseOrderDraftInput = {
  supplierId: string;
  materialRequestId?: string | null;
  conversationId?: string | null;
  sourceType: PurchaseOrderSourceType;
  notes?: string | null;
  items: CreatePurchaseOrderItemInput[];
};

export type CreatePurchaseOrderDraftResult = {
  purchaseOrderId: string;
};
