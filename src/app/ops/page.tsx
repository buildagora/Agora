"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { categoryIdToLabel } from "@/lib/categoryIds";

type MaterialRequestRow = {
  id: string;
  categoryId: string;
  requestText: string;
  sendMode?: string;
  status?: string;
  createdAt: string;
  updatedAt?: string;
  opsStatus: string;
  emailStatus: string | null;
  counts: {
    totalRecipients: number;
    repliedCount: number;
    pendingCount: number;
    declinedCount: number;
  };
};

const OPS_ORDER: Record<string, number> = {
  NEW: 0,
  IN_PROGRESS: 1,
  COMPLETED: 2,
};

function sortOpsRows(a: MaterialRequestRow, b: MaterialRequestRow): number {
  const da = OPS_ORDER[a.opsStatus] ?? 99;
  const db = OPS_ORDER[b.opsStatus] ?? 99;
  if (da !== db) return da - db;
  return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
}

function opsStatusBadgeClasses(opsStatus: string): string {
  switch (opsStatus) {
    case "NEW":
      return "border-amber-200 bg-amber-50 text-amber-900";
    case "IN_PROGRESS":
      return "border-blue-200 bg-blue-50 text-blue-900";
    case "COMPLETED":
      return "border-emerald-200 bg-emerald-50 text-emerald-900";
    default:
      return "border-zinc-200 bg-zinc-100 text-zinc-800";
  }
}

/**
 * Operator dashboard: material requests.
 * GET /api/ops/material-requests (same JSON base shape + opsStatus / emailStatus).
 */
export default function OpsMaterialRequestsPage() {
  const [rows, setRows] = useState<MaterialRequestRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadRows = useCallback(async () => {
    const res = await fetch("/api/ops/material-requests");
    const json = await res.json().catch(() => null);

    if (!res.ok || !json?.ok || !Array.isArray(json.data)) {
      const msg =
        typeof json?.message === "string"
          ? json.message
          : typeof json?.error === "string"
            ? json.error
            : `Failed to load (${res.status})`;
      setError(msg);
      setRows([]);
      return;
    }

    const sorted = [...json.data].sort(sortOpsRows);
    setRows(sorted);
    setError(null);
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        await loadRows();
        if (cancelled) return;
      } catch {
        if (!cancelled) {
          setError("Network error");
          setRows([]);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [loadRows]);

  const setOpsStatus = async (id: string, opsStatus: "NEW" | "IN_PROGRESS" | "COMPLETED") => {
    try {
      const res = await fetch(`/api/ops/material-requests/${id}/update-status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ opsStatus }),
      });
      if (!res.ok) {
        setError(`Update failed (${res.status})`);
        return;
      }
      await loadRows();
    } catch {
      setError("Network error");
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 py-10 px-4">
      <div className="mx-auto w-full max-w-2xl space-y-6">
        <h1 className="text-xl font-semibold text-zinc-900">
          Material requests
        </h1>

        {rows === null && (
          <p className="text-sm text-zinc-600">Loading…</p>
        )}

        {error && (
          <p className="text-sm text-red-600">{error}</p>
        )}

        {rows && rows.length === 0 && !error && (
          <p className="text-sm text-zinc-600">No requests yet.</p>
        )}

        {rows && rows.length > 0 && (
          <ul className="space-y-3">
            {rows.map((r) => {
              const category =
                categoryIdToLabel[
                  r.categoryId as keyof typeof categoryIdToLabel
                ] ?? r.categoryId;
              const { totalRecipients, repliedCount, pendingCount, declinedCount } =
                r.counts;
              return (
                <li
                  key={r.id}
                  className="rounded-lg border border-zinc-200 bg-white shadow-sm"
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
                    <Link
                      href={`/ops/material-requests/${r.id}`}
                      className="min-w-0 flex-1 p-4 hover:bg-zinc-50/80"
                    >
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <span
                          className={`inline-flex rounded-md border px-2 py-0.5 text-xs font-medium ${opsStatusBadgeClasses(r.opsStatus)}`}
                        >
                          {r.opsStatus}
                        </span>
                        {r.emailStatus === "FAILED" && (
                          <span className="text-xs font-medium text-red-600">
                            Email failed — retrying
                          </span>
                        )}
                        {r.emailStatus === "OUTBOX" && (
                          <span className="text-xs font-medium text-amber-700">
                            Retry pending
                          </span>
                        )}
                      </div>
                      <p className="text-sm font-medium text-zinc-900 line-clamp-3">
                        {r.requestText || "—"}
                      </p>
                      <p className="mt-2 text-xs text-zinc-500">
                        {category} ·{" "}
                        {new Date(r.createdAt).toLocaleString(undefined, {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                      </p>
                      <p className="mt-2 text-xs text-zinc-600">
                        total {totalRecipients} · available {repliedCount} ·
                        checking {pendingCount} · unavailable {declinedCount}
                      </p>
                    </Link>
                    <div className="flex shrink-0 flex-row gap-2 border-t border-zinc-100 p-3 sm:flex-col sm:border-l sm:border-t-0 sm:py-4">
                      <button
                        type="button"
                        onClick={() => setOpsStatus(r.id, "IN_PROGRESS")}
                        className="rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-800 hover:bg-zinc-50"
                      >
                        Start
                      </button>
                      <button
                        type="button"
                        onClick={() => setOpsStatus(r.id, "COMPLETED")}
                        className="rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-800 hover:bg-zinc-50"
                      >
                        Complete
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
