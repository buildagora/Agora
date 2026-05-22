"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { PurchaseOrderSourceType } from "@/lib/procurement/types";
import { usePurchaseOrderPanel } from "./purchase-order/PurchaseOrderPanelContext";

type CreatePurchaseOrderDraftButtonProps = {
  requestId: string;
  supplierId: string;
  materialRequestId: string;
  conversationId: string | null;
  sourceType: PurchaseOrderSourceType;
  originalSearchText: string;
  productName: string;
  sourceListingUrl: string | null;
  label: string;
  description: string;
  onCreated?: (purchaseOrderId: string) => void;
};

export default function CreatePurchaseOrderDraftButton({
  requestId,
  supplierId,
  materialRequestId,
  conversationId,
  sourceType,
  originalSearchText,
  productName,
  sourceListingUrl,
  label,
  description,
  onCreated,
}: CreatePurchaseOrderDraftButtonProps) {
  const router = useRouter();
  const panel = usePurchaseOrderPanel();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    setPending(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/request/${encodeURIComponent(requestId)}/supplier/${encodeURIComponent(supplierId)}/purchase-order-draft`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            materialRequestId,
            conversationId,
            sourceType,
            originalSearchText,
            productName,
            sourceListingUrl,
          }),
        },
      );

      const json = (await res.json()) as {
        ok?: boolean;
        data?: { purchaseOrderId?: string };
        message?: string;
      };

      if (!res.ok || !json.ok || !json.data?.purchaseOrderId) {
        setError(json.message || "Could not create order request. Please try again.");
        return;
      }

      const purchaseOrderId = json.data.purchaseOrderId;
      const handleCreated = onCreated ?? panel?.onDraftCreated;
      if (handleCreated) {
        handleCreated(purchaseOrderId);
        return;
      }

      router.push(
        `/request/${requestId}/supplier/${supplierId}/purchase-order/${purchaseOrderId}`,
      );
    } catch {
      setError("Could not create order request. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={handleCreate}
        disabled={pending}
        className="inline-flex items-center rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Creating…" : label}
      </button>
      <p className="mt-2 text-xs leading-relaxed text-zinc-500">{description}</p>
      {error && (
        <p className="mt-2 text-xs text-red-600" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
