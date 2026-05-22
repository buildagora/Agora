"use client";

import { createContext, useContext } from "react";

type PurchaseOrderPanelContextValue = {
  onDraftCreated: (purchaseOrderId: string) => void;
};

const PurchaseOrderPanelContext =
  createContext<PurchaseOrderPanelContextValue | null>(null);

export function PurchaseOrderPanelProvider({
  onDraftCreated,
  children,
}: {
  onDraftCreated: (purchaseOrderId: string) => void;
  children: React.ReactNode;
}) {
  return (
    <PurchaseOrderPanelContext.Provider value={{ onDraftCreated }}>
      {children}
    </PurchaseOrderPanelContext.Provider>
  );
}

export function usePurchaseOrderPanel() {
  return useContext(PurchaseOrderPanelContext);
}
