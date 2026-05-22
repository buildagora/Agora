"use client";

import { useEffect, useRef, useState } from "react";
import PurchaseOrderDraftPanel from "./purchase-order/PurchaseOrderDraftPanel";
import { PurchaseOrderPanelProvider } from "./purchase-order/PurchaseOrderPanelContext";

export type SupplierDetailPurchaseOrderLayoutProps = {
  supplierName: string;
  productName: string;
  originalSearchText: string;
  sourceListingUrl: string | null;
  children: React.ReactNode;
};

export default function SupplierDetailPurchaseOrderLayout({
  supplierName,
  productName,
  originalSearchText,
  sourceListingUrl,
  children,
}: SupplierDetailPurchaseOrderLayoutProps) {
  const [purchaseOrderId, setPurchaseOrderId] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!purchaseOrderId) return;
    panelRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [purchaseOrderId]);

  return (
    <PurchaseOrderPanelProvider onDraftCreated={setPurchaseOrderId}>
      <div
        className={
          purchaseOrderId
            ? "lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(300px,380px)] lg:items-start lg:gap-6 xl:grid-cols-[minmax(0,1fr)_400px] xl:gap-8"
            : undefined
        }
      >
        <div className="min-w-0 space-y-4 sm:space-y-5">{children}</div>

        {purchaseOrderId && (
          <div
            ref={panelRef}
            className="mt-6 lg:mt-0 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:self-start"
          >
            <PurchaseOrderDraftPanel
              purchaseOrderId={purchaseOrderId}
              supplierName={supplierName}
              productName={productName}
              originalSearchText={originalSearchText}
              sourceListingUrl={sourceListingUrl}
              onClose={() => setPurchaseOrderId(null)}
            />
          </div>
        )}
      </div>
    </PurchaseOrderPanelProvider>
  );
}
