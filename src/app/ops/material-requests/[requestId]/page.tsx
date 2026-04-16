"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

type RequestSummary = {
  id: string;
  categoryId: string;
  requestText: string;
  createdAt: string;
  locationCity?: string | null;
  locationRegion?: string | null;
  locationCountry?: string | null;
};

function formatOpsRequestLocation(r: RequestSummary): string | null {
  const city = r.locationCity?.trim();
  const region = r.locationRegion?.trim();
  const country = r.locationCountry?.trim();
  if (city || region) {
    return [city, region].filter(Boolean).join(", ");
  }
  if (country) return country;
  return null;
}

type RecipientRow = {
  supplierId: string;
  supplierName: string;
  status: string;
  operatorNotes: string | null;
  availabilityStatus: string | null;
  quantityAvailable: number | null;
  quantityUnit: string | null;
  price: number | null;
  priceUnit: string | null;
  pickupAvailable: boolean | null;
  deliveryAvailable: boolean | null;
  deliveryEta: string | null;
};

const AVAILABILITY_OPTIONS = [
  "CHECKING",
  "IN_STOCK",
  "OUT_OF_STOCK",
  "AVAILABLE_SOON",
] as const;

function inferAvailability(row: RecipientRow): (typeof AVAILABILITY_OPTIONS)[number] {
  const av = row.availabilityStatus;
  if (
    av &&
    (AVAILABILITY_OPTIONS as readonly string[]).includes(av)
  ) {
    return av as (typeof AVAILABILITY_OPTIONS)[number];
  }
  if (row.status === "REPLIED") return "IN_STOCK";
  if (row.status === "OUT_OF_STOCK") return "OUT_OF_STOCK";
  return "CHECKING";
}

type RecipientDraft = {
  availabilityStatus: (typeof AVAILABILITY_OPTIONS)[number];
  quantityAvailable: string;
  quantityUnit: string;
  price: string;
  priceUnit: string;
  pickupAvailable: "" | "true" | "false";
  deliveryAvailable: "" | "true" | "false";
  deliveryEta: string;
  notes: string;
};

function rowToDraft(row: RecipientRow): RecipientDraft {
  return {
    availabilityStatus: inferAvailability(row),
    quantityAvailable:
      row.quantityAvailable != null ? String(row.quantityAvailable) : "",
    quantityUnit: row.quantityUnit ?? "",
    price: row.price != null ? String(row.price) : "",
    priceUnit: row.priceUnit ?? "",
    pickupAvailable:
      row.pickupAvailable === true
        ? "true"
        : row.pickupAvailable === false
          ? "false"
          : "",
    deliveryAvailable:
      row.deliveryAvailable === true
        ? "true"
        : row.deliveryAvailable === false
          ? "false"
          : "",
    deliveryEta: row.deliveryEta ?? "",
    notes: row.operatorNotes ?? "",
  };
}

async function fetchDetail(requestId: string) {
  let res = await fetch(`/api/buyer/material-requests/${requestId}`, {
    credentials: "include",
  });
  if (res.status === 401 || res.status === 403) {
    res = await fetch(`/api/ops/material-requests/${requestId}`);
  }
  const json = await res.json().catch(() => null);
  return { res, json };
}

export default function OpsMaterialRequestDetailPage() {
  const params = useParams();
  const requestId = typeof params.requestId === "string" ? params.requestId : "";

  const [request, setRequest] = useState<RequestSummary | null>(null);
  const [recipients, setRecipients] = useState<RecipientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  const [drafts, setDrafts] = useState<Record<string, RecipientDraft>>({});

  const load = useCallback(async () => {
    if (!requestId.trim()) {
      setLoadError("Missing request id");
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const { res, json } = await fetchDetail(requestId);
      if (!res.ok || !json?.ok || !json.request || !json.recipients) {
        const msg =
          typeof json?.message === "string"
            ? json.message
            : typeof json?.error === "string"
              ? json.error
              : `Failed to load (${res.status})`;
        setRequest(null);
        setRecipients([]);
        setDrafts({});
        setLoadError(msg);
        return;
      }

      const r = json.request as RequestSummary;
      const rec = json.recipients as {
        replied: RecipientRow[];
        pending: RecipientRow[];
        closedOut: RecipientRow[];
      };
      const allRecipients = [...rec.replied, ...rec.pending, ...rec.closedOut];

      setRequest({
        id: r.id,
        categoryId: r.categoryId,
        requestText: r.requestText,
        createdAt: r.createdAt,
        locationCity: r.locationCity ?? null,
        locationRegion: r.locationRegion ?? null,
        locationCountry: r.locationCountry ?? null,
      });
      setRecipients(allRecipients);

      const nextDrafts: Record<string, RecipientDraft> = {};
      for (const row of allRecipients) {
        nextDrafts[row.supplierId] = rowToDraft(row);
      }
      setDrafts(nextDrafts);
    } catch {
      setLoadError("Network error");
      setRequest(null);
      setRecipients([]);
      setDrafts({});
    } finally {
      setLoading(false);
    }
  }, [requestId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSave(supplierId: string) {
    const draft = drafts[supplierId];
    if (!draft || !requestId.trim()) return;

    setSaveMessage(null);
    setSaveError(null);
    setSavingId(supplierId);

    const qtyTrim = draft.quantityAvailable.trim();
    const priceTrim = draft.price.trim();

    const body: Record<string, unknown> = {
      supplierId,
      availabilityStatus: draft.availabilityStatus,
      quantityUnit: draft.quantityUnit.trim() || null,
      priceUnit: draft.priceUnit.trim() || null,
      deliveryEta: draft.deliveryEta.trim() || null,
      operatorNotes: draft.notes.trim() || null,
    };

    body.quantityAvailable = qtyTrim === "" ? null : qtyTrim;
    body.price = priceTrim === "" ? null : priceTrim;
    body.pickupAvailable =
      draft.pickupAvailable === ""
        ? null
        : draft.pickupAvailable === "true";
    body.deliveryAvailable =
      draft.deliveryAvailable === ""
        ? null
        : draft.deliveryAvailable === "true";

    try {
      const res = await fetch(
        `/api/ops/material-requests/${requestId}/update-recipient`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        const msg =
          typeof json?.message === "string"
            ? json.message
            : typeof json?.error === "string"
              ? json.error
              : `Save failed (${res.status})`;
        setSaveError(msg);
        return;
      }
      setSaveMessage(`Saved supplier ${supplierId.slice(0, 8)}…`);
      await load();
    } catch {
      setSaveError("Network error while saving");
    } finally {
      setSavingId(null);
    }
  }

  if (!requestId.trim()) {
    return (
      <div className="min-h-screen bg-zinc-50 px-4 py-8">
        <div className="mx-auto max-w-lg text-sm text-red-600">Invalid URL.</div>
      </div>
    );
  }

  const locationLine =
    request != null ? formatOpsRequestLocation(request) : null;

  return (
    <div className="min-h-screen bg-zinc-50 px-4 py-8 pb-16">
      <div className="mx-auto w-full max-w-2xl space-y-6">
        <div>
          <Link
            href="/ops"
            className="text-sm text-zinc-600 underline underline-offset-2"
          >
            ← Back to requests
          </Link>
        </div>

        {loading && (
          <p className="text-sm text-zinc-600">Loading…</p>
        )}

        {loadError && (
          <p className="text-sm text-red-600">{loadError}</p>
        )}

        {saveError && (
          <p className="text-sm text-red-600">{saveError}</p>
        )}

        {saveMessage && (
          <p className="text-sm text-green-700">{saveMessage}</p>
        )}

        {request && !loading && (
          <>
            <header className="space-y-2 rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
              <h1 className="text-base font-semibold text-zinc-900 whitespace-pre-wrap">
                {request.requestText || "—"}
              </h1>
              <p className="text-sm text-zinc-600">
                <span className="font-medium text-zinc-800">categoryId:</span>{" "}
                {request.categoryId}
              </p>
              {locationLine && (
                <p className="text-sm text-zinc-600">
                  <span className="font-medium text-zinc-800">location:</span>{" "}
                  {locationLine}
                </p>
              )}
              <p className="text-sm text-zinc-600">
                <span className="font-medium text-zinc-800">createdAt:</span>{" "}
                {new Date(request.createdAt).toLocaleString(undefined, {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </p>
            </header>

            <section className="space-y-4">
              <h2 className="text-sm font-medium text-zinc-800">
                Suppliers ({recipients.length})
              </h2>
              {recipients.map((row) => {
                const draft = drafts[row.supplierId] ?? rowToDraft(row);
                return (
                  <div
                    key={row.supplierId}
                    className="space-y-3 rounded-lg border border-zinc-200 bg-white p-4 shadow-sm"
                  >
                    <div>
                      <p className="font-medium text-zinc-900">
                        {row.supplierName}
                      </p>
                      <p className="mt-1 text-xs text-zinc-500">
                        Recipient status:{" "}
                        <span className="font-mono">{row.status}</span>
                      </p>
                    </div>

                    <label className="block text-xs font-medium text-zinc-700">
                      Availability
                      <select
                        className="mt-1 block w-full rounded border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
                        value={draft.availabilityStatus}
                        onChange={(e) =>
                          setDrafts((d) => ({
                            ...d,
                            [row.supplierId]: {
                              ...draft,
                              availabilityStatus: e.target
                                .value as RecipientDraft["availabilityStatus"],
                            },
                          }))
                        }
                      >
                        {AVAILABILITY_OPTIONS.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    </label>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="block text-xs font-medium text-zinc-700">
                        Quantity available
                        <input
                          type="number"
                          className="mt-1 block w-full rounded border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
                          value={draft.quantityAvailable}
                          onChange={(e) =>
                            setDrafts((d) => ({
                              ...d,
                              [row.supplierId]: {
                                ...draft,
                                quantityAvailable: e.target.value,
                              },
                            }))
                          }
                        />
                      </label>
                      <label className="block text-xs font-medium text-zinc-700">
                        Quantity unit
                        <input
                          type="text"
                          className="mt-1 block w-full rounded border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
                          value={draft.quantityUnit}
                          onChange={(e) =>
                            setDrafts((d) => ({
                              ...d,
                              [row.supplierId]: {
                                ...draft,
                                quantityUnit: e.target.value,
                              },
                            }))
                          }
                        />
                      </label>
                      <label className="block text-xs font-medium text-zinc-700">
                        Price
                        <input
                          type="text"
                          inputMode="decimal"
                          className="mt-1 block w-full rounded border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
                          value={draft.price}
                          onChange={(e) =>
                            setDrafts((d) => ({
                              ...d,
                              [row.supplierId]: {
                                ...draft,
                                price: e.target.value,
                              },
                            }))
                          }
                        />
                      </label>
                      <label className="block text-xs font-medium text-zinc-700">
                        Price unit
                        <input
                          type="text"
                          className="mt-1 block w-full rounded border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
                          value={draft.priceUnit}
                          onChange={(e) =>
                            setDrafts((d) => ({
                              ...d,
                              [row.supplierId]: {
                                ...draft,
                                priceUnit: e.target.value,
                              },
                            }))
                          }
                        />
                      </label>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="block text-xs font-medium text-zinc-700">
                        Pickup available
                        <select
                          className="mt-1 block w-full rounded border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
                          value={draft.pickupAvailable}
                          onChange={(e) =>
                            setDrafts((d) => ({
                              ...d,
                              [row.supplierId]: {
                                ...draft,
                                pickupAvailable: e.target.value as RecipientDraft["pickupAvailable"],
                              },
                            }))
                          }
                        >
                          <option value="">—</option>
                          <option value="true">Yes</option>
                          <option value="false">No</option>
                        </select>
                      </label>
                      <label className="block text-xs font-medium text-zinc-700">
                        Delivery available
                        <select
                          className="mt-1 block w-full rounded border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
                          value={draft.deliveryAvailable}
                          onChange={(e) =>
                            setDrafts((d) => ({
                              ...d,
                              [row.supplierId]: {
                                ...draft,
                                deliveryAvailable: e.target.value as RecipientDraft["deliveryAvailable"],
                              },
                            }))
                          }
                        >
                          <option value="">—</option>
                          <option value="true">Yes</option>
                          <option value="false">No</option>
                        </select>
                      </label>
                    </div>

                    <label className="block text-xs font-medium text-zinc-700">
                      Delivery ETA
                      <input
                        type="text"
                        className="mt-1 block w-full rounded border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
                        value={draft.deliveryEta}
                        onChange={(e) =>
                          setDrafts((d) => ({
                            ...d,
                            [row.supplierId]: {
                              ...draft,
                              deliveryEta: e.target.value,
                            },
                          }))
                        }
                      />
                    </label>

                    <label className="block text-xs font-medium text-zinc-700">
                      Operator notes
                      <textarea
                        className="mt-1 block min-h-[88px] w-full rounded border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
                        value={draft.notes}
                        onChange={(e) =>
                          setDrafts((d) => ({
                            ...d,
                            [row.supplierId]: {
                              ...draft,
                              notes: e.target.value,
                            },
                          }))
                        }
                        rows={4}
                      />
                    </label>

                    <button
                      type="button"
                      className="w-full rounded border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50 sm:w-auto"
                      disabled={savingId === row.supplierId}
                      onClick={() => handleSave(row.supplierId)}
                    >
                      {savingId === row.supplierId ? "Saving…" : "Save"}
                    </button>
                  </div>
                );
              })}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
