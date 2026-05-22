"use client";

import { useState } from "react";

export const purchaseOrderInputClassName =
  "mt-1.5 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 shadow-sm placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-200";

export const purchaseOrderLabelClassName =
  "text-xs font-medium uppercase tracking-wide text-zinc-500";

export type PurchaseOrderDraftFormProps = {
  purchaseOrderId: string;
  productName: string;
  originalSearchText: string;
  sourceListingUrl: string | null;
  initialQuantity: string;
  initialUnit: string;
  initialSpecNotes: string;
  initialRequestedDate: string;
  initialDeliveryNotes: string;
  variant?: "page" | "panel";
  idPrefix?: string;
};

type SaveStatus = "idle" | "saving" | "saved" | "error";

function productInitials(productName: string): string {
  const words = productName.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return `${words[0][0] ?? ""}${words[1][0] ?? ""}`.toUpperCase();
  }
  const compact = productName.trim().replace(/\s+/g, "");
  return (compact.slice(0, 2) || "PO").toUpperCase();
}

function PanelProcurementSummary() {
  return (
    <div className="rounded-lg border border-zinc-100 bg-zinc-50/70 px-2.5 py-2">
      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
        Order summary
      </p>
      <dl className="space-y-1 text-[11px]">
        <div className="flex items-center justify-between gap-2">
          <dt className="text-zinc-400">Status</dt>
          <dd className="font-medium text-zinc-700">Draft</dd>
        </div>
        <div className="flex items-center justify-between gap-2">
          <dt className="text-zinc-400">Price</dt>
          <dd className="text-right text-zinc-600">Supplier to confirm</dd>
        </div>
        <div className="flex items-center justify-between gap-2">
          <dt className="text-zinc-400">Availability</dt>
          <dd className="text-right text-zinc-600">Supplier to confirm</dd>
        </div>
      </dl>
    </div>
  );
}

export default function PurchaseOrderDraftForm({
  purchaseOrderId,
  productName,
  originalSearchText,
  sourceListingUrl,
  initialQuantity,
  initialUnit,
  initialSpecNotes,
  initialRequestedDate,
  initialDeliveryNotes,
  variant = "page",
  idPrefix = "po",
}: PurchaseOrderDraftFormProps) {
  const isPanel = variant === "panel";
  const [fulfillment, setFulfillment] = useState<"PICKUP" | "DELIVERY">("PICKUP");
  const [quantity, setQuantity] = useState(initialQuantity);
  const [unit, setUnit] = useState(initialUnit);
  const [specNotes, setSpecNotes] = useState(initialSpecNotes);
  const [requestedDate, setRequestedDate] = useState(initialRequestedDate);
  const [deliveryNotes, setDeliveryNotes] = useState(initialDeliveryNotes);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const inputClassName = isPanel
    ? "mt-1 w-full rounded-md border border-zinc-200 bg-white px-2.5 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-200"
    : purchaseOrderInputClassName;

  const panelLabelClassName =
    "text-[10px] font-medium uppercase tracking-wide text-zinc-500";

  async function handleSaveDraft(event: React.FormEvent) {
    event.preventDefault();
    setSaveStatus("saving");
    setErrorMessage(null);

    try {
      const res = await fetch(
        `/api/purchase-orders/${encodeURIComponent(purchaseOrderId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            notes: specNotes.trim() || null,
            requestedDeliveryDate: requestedDate.trim() || null,
            quantity: quantity.trim() || null,
            unit: unit.trim() || null,
            fulfillmentMethod: fulfillment,
            deliveryNotes: deliveryNotes.trim() || null,
          }),
        },
      );

      const json = (await res.json()) as { ok?: boolean; message?: string };

      if (!res.ok || !json.ok) {
        setSaveStatus("error");
        setErrorMessage(json.message || "Could not save draft. Please try again.");
        return;
      }

      setSaveStatus("saved");
    } catch {
      setSaveStatus("error");
      setErrorMessage("Could not save draft. Please try again.");
    }
  }

  const savePending = saveStatus === "saving";
  const fieldId = (name: string) => `${idPrefix}-${name}`;

  const itemFields = (
    <div className={isPanel ? "space-y-2.5" : "mt-4 space-y-4"}>
      {!isPanel && (
        <>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">
              Product
            </p>
            <p className="mt-1 text-base font-semibold text-zinc-900">{productName}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">
              Original search
            </p>
            <p className="mt-1 text-sm leading-relaxed text-zinc-700">
              {originalSearchText}
            </p>
          </div>
        </>
      )}

      {isPanel && (
        <div className="rounded-lg border border-zinc-200 bg-white p-2.5 shadow-sm">
          <div className="flex gap-2.5">
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-zinc-200 bg-zinc-50 text-xs font-semibold text-zinc-600"
              aria-hidden
            >
              {productInitials(productName)}
            </div>
            <div className="min-w-0 flex-1">
              <p className={panelLabelClassName}>Item</p>
              <p className="mt-0.5 text-sm font-semibold leading-snug text-zinc-900">
                {productName}
              </p>
              <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-zinc-500">
                {originalSearchText}
              </p>
              {sourceListingUrl && (
                <a
                  href={sourceListingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-block text-[11px] font-medium text-zinc-600 underline decoration-zinc-300 underline-offset-2 hover:text-zinc-900"
                >
                  View listing
                </a>
              )}
            </div>
          </div>
        </div>
      )}

      {!isPanel && sourceListingUrl && (
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">
            Source listing
          </p>
          <a
            href={sourceListingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 inline-block break-all text-sm font-medium text-zinc-700 underline decoration-zinc-300 underline-offset-2 hover:text-zinc-900"
          >
            {sourceListingUrl}
          </a>
        </div>
      )}

      <div className={isPanel ? "grid grid-cols-2 gap-2" : "grid gap-4 sm:grid-cols-2"}>
        <div>
          <label
            htmlFor={fieldId("quantity")}
            className={isPanel ? panelLabelClassName : purchaseOrderLabelClassName}
          >
            Quantity
          </label>
          <input
            id={fieldId("quantity")}
            name="quantity"
            type="text"
            inputMode="decimal"
            placeholder="e.g. 10"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            className={inputClassName}
          />
        </div>
        <div>
          <label
            htmlFor={fieldId("unit")}
            className={isPanel ? panelLabelClassName : purchaseOrderLabelClassName}
          >
            Unit
          </label>
          <input
            id={fieldId("unit")}
            name="unit"
            type="text"
            placeholder="e.g. bundles"
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            className={inputClassName}
          />
        </div>
      </div>

      <div>
        <label
          htmlFor={fieldId("specNotes")}
          className={isPanel ? panelLabelClassName : purchaseOrderLabelClassName}
        >
          {isPanel ? "Notes" : "Notes / spec clarifications"}
        </label>
        <textarea
          id={fieldId("specNotes")}
          name="specNotes"
          rows={isPanel ? 2 : 3}
          placeholder={
            isPanel ? "Specs, color, grade…" : "Color, grade, brand preference, substitutions, etc."
          }
          value={specNotes}
          onChange={(e) => setSpecNotes(e.target.value)}
          className={inputClassName}
        />
      </div>
    </div>
  );

  const fulfillmentFields = (
    <div className={isPanel ? "space-y-2 border-t border-zinc-100 pt-2.5" : "mt-4"}>
      {!isPanel && <h2 className="text-sm font-semibold text-zinc-900">Fulfillment</h2>}
      {isPanel && (
        <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-700">
          Fulfillment
        </p>
      )}

      <div>
        <p className={isPanel ? panelLabelClassName : purchaseOrderLabelClassName}>
          Method
        </p>
        <div className={`grid grid-cols-2 gap-2 ${isPanel ? "mt-1" : "mt-2"}`}>
          <button
            type="button"
            onClick={() => setFulfillment("PICKUP")}
            className={`rounded-md border text-sm font-medium transition ${
              isPanel ? "px-2 py-2" : "rounded-lg px-3 py-2.5"
            } ${
              fulfillment === "PICKUP"
                ? "border-zinc-900 bg-zinc-900 text-white"
                : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300"
            }`}
          >
            Pickup
          </button>
          <button
            type="button"
            onClick={() => setFulfillment("DELIVERY")}
            className={`rounded-md border text-sm font-medium transition ${
              isPanel ? "px-2 py-2" : "rounded-lg px-3 py-2.5"
            } ${
              fulfillment === "DELIVERY"
                ? "border-zinc-900 bg-zinc-900 text-white"
                : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300"
            }`}
          >
            Delivery
          </button>
        </div>
      </div>

      <div>
        <label
          htmlFor={fieldId("requestedDate")}
          className={isPanel ? panelLabelClassName : purchaseOrderLabelClassName}
        >
          Requested date
        </label>
        <input
          id={fieldId("requestedDate")}
          name="requestedDate"
          type="date"
          value={requestedDate}
          onChange={(e) => setRequestedDate(e.target.value)}
          className={inputClassName}
        />
      </div>

      <div>
        <label
          htmlFor={fieldId("deliveryNotes")}
          className={isPanel ? panelLabelClassName : purchaseOrderLabelClassName}
        >
          Delivery notes
        </label>
        <textarea
          id={fieldId("deliveryNotes")}
          name="deliveryNotes"
          rows={isPanel ? 2 : 3}
          placeholder={
            isPanel ? "Site access, dock hours…" : "Job site access, dock hours, contact on site, etc."
          }
          value={deliveryNotes}
          onChange={(e) => setDeliveryNotes(e.target.value)}
          className={inputClassName}
        />
      </div>
    </div>
  );

  const saveFeedback = (
    <>
      {saveStatus === "saved" && (
        <p className="text-center text-xs font-medium text-emerald-700">Saved just now</p>
      )}
      {saveStatus === "error" && errorMessage && (
        <p className="text-center text-xs text-red-600" role="alert">
          {errorMessage}
        </p>
      )}
    </>
  );

  const panelActions = (
    <div className="mt-1 space-y-2 border-t border-zinc-200/80 pt-2.5">
      <button
        type="button"
        disabled
        className="w-full rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm opacity-60 cursor-not-allowed"
      >
        Send order request
      </button>
      <p className="text-center text-[10px] leading-tight text-zinc-400">
        Sending to supplier coming next.
      </p>
      <button
        type="submit"
        disabled={savePending}
        className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-800 shadow-sm transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {savePending ? "Saving…" : "Save draft"}
      </button>
      {saveFeedback}
    </div>
  );

  const pageActions = (
    <div className="space-y-3">
      <button
        type="submit"
        disabled={savePending}
        className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-3 text-sm font-semibold text-zinc-900 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {savePending ? "Saving…" : "Save draft"}
      </button>
      {saveFeedback}
      <button
        type="button"
        disabled
        className="w-full rounded-lg bg-zinc-900 px-4 py-3 text-sm font-semibold text-white opacity-60 cursor-not-allowed"
      >
        Send order request
      </button>
      <p className="text-center text-xs text-zinc-500">
        Sending to supplier coming next.
      </p>
    </div>
  );

  if (isPanel) {
    return (
      <form onSubmit={handleSaveDraft} className="space-y-2.5 pb-1">
        {itemFields}
        {fulfillmentFields}
        <PanelProcurementSummary />
        {panelActions}
      </form>
    );
  }

  return (
    <form onSubmit={handleSaveDraft} className="space-y-5">
      <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-zinc-900">Order item</h2>
        {itemFields}
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        {fulfillmentFields}
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        {pageActions}
      </section>
    </form>
  );
}
