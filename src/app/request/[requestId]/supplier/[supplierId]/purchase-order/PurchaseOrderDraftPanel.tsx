"use client";

import PurchaseOrderDraftForm from "./PurchaseOrderDraftForm";

export type PurchaseOrderDraftPanelProps = {
  purchaseOrderId: string;
  supplierName: string;
  productName: string;
  originalSearchText: string;
  sourceListingUrl: string | null;
  onClose?: () => void;
};

export default function PurchaseOrderDraftPanel({
  purchaseOrderId,
  supplierName,
  productName,
  originalSearchText,
  sourceListingUrl,
  onClose,
}: PurchaseOrderDraftPanelProps) {
  return (
    <aside
      className="flex h-full max-h-[calc(100vh-2rem)] flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-lg"
      aria-label="Purchase order draft"
    >
      <div className="shrink-0 border-b border-zinc-200/80 bg-gradient-to-b from-zinc-50/90 to-white px-3 py-3 sm:px-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold tracking-tight text-zinc-900">
                Purchase Order
              </h2>
              <span className="inline-flex shrink-0 items-center rounded border border-zinc-200 bg-white px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-zinc-600 shadow-sm">
                Draft
              </span>
            </div>
            <p className="mt-1 text-xs text-zinc-600">
              Supplier:{" "}
              <span className="font-medium text-zinc-800">{supplierName}</span>
            </p>
            <p className="mt-1.5 text-[11px] leading-snug text-zinc-500">
              Review the details before sending this to the supplier.
            </p>
          </div>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 rounded-md p-1 text-zinc-400 transition hover:bg-zinc-100/80 hover:text-zinc-700"
              aria-label="Close purchase order panel"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="h-4 w-4"
                aria-hidden
              >
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 sm:px-4">
        <PurchaseOrderDraftForm
          variant="panel"
          idPrefix="po-panel"
          purchaseOrderId={purchaseOrderId}
          productName={productName}
          originalSearchText={originalSearchText}
          sourceListingUrl={sourceListingUrl}
          initialQuantity=""
          initialUnit=""
          initialSpecNotes=""
          initialRequestedDate=""
          initialDeliveryNotes=""
        />
      </div>
    </aside>
  );
}
