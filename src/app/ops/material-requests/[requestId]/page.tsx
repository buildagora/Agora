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
};

const STATUS_OPTIONS = ["VIEWED", "REPLIED", "OUT_OF_STOCK", "NO_RESPONSE"] as const;

function normalizeStatusForForm(status: string): (typeof STATUS_OPTIONS)[number] {
  if (STATUS_OPTIONS.includes(status as (typeof STATUS_OPTIONS)[number])) {
    return status as (typeof STATUS_OPTIONS)[number];
  }
  if (status === "SENT") return "VIEWED";
  if (status === "DECLINED") return "NO_RESPONSE";
  return "VIEWED";
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

  /** Per-supplier draft: status + notes while editing */
  const [drafts, setDrafts] = useState<
    Record<string, { status: string; notes: string }>
  >({});

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

      const nextDrafts: Record<string, { status: string; notes: string }> = {};
      for (const row of allRecipients) {
        nextDrafts[row.supplierId] = {
          status: normalizeStatusForForm(row.status),
          notes: row.operatorNotes ?? "",
        };
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

    try {
      const res = await fetch(
        `/api/ops/material-requests/${requestId}/update-recipient`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            supplierId,
            status: draft.status,
            notes: draft.notes,
          }),
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
      <div className="mx-auto w-full max-w-xl space-y-6">
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
                const draft = drafts[row.supplierId] ?? {
                  status: normalizeStatusForForm(row.status),
                  notes: row.operatorNotes ?? "",
                };
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
                        Current status:{" "}
                        <span className="font-mono">{row.status}</span>
                      </p>
                    </div>

                    <label className="block text-xs font-medium text-zinc-700">
                      Status
                      <select
                        className="mt-1 block w-full rounded border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
                        value={draft.status}
                        onChange={(e) =>
                          setDrafts((d) => ({
                            ...d,
                            [row.supplierId]: {
                              ...draft,
                              status: e.target.value,
                            },
                          }))
                        }
                      >
                        {STATUS_OPTIONS.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="block text-xs font-medium text-zinc-700">
                      Notes
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
