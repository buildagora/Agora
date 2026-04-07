"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { categoryIdToLabel } from "@/lib/categoryIds";

type MaterialRequestRow = {
  id: string;
  categoryId: string;
  requestText: string;
  createdAt: string;
  counts: {
    totalRecipients: number;
    repliedCount: number;
    pendingCount: number;
    declinedCount: number;
  };
};

/**
 * Operator dashboard: material requests.
 * Tries GET /api/buyer/material-requests (session cookie); if unauthorized,
 * falls back to GET /api/ops/material-requests (all rows, local ops — same JSON shape).
 */
export default function OpsMaterialRequestsPage() {
  const [rows, setRows] = useState<MaterialRequestRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch("/api/ops/material-requests");

        const json = await res.json().catch(() => null);

        if (!res.ok || !json?.ok || !Array.isArray(json.data)) {
          const msg =
            typeof json?.message === "string"
              ? json.message
              : typeof json?.error === "string"
              ? json.error
              : `Failed to load (${res.status})`;

          if (!cancelled) {
            setError(msg);
            setRows([]);
          }
          return;
        }

        if (!cancelled) {
          setRows(json.data);
          setError(null);
        }
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
  }, []);

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
                <li key={r.id}>
                  <Link
                    href={`/ops/material-requests/${r.id}`}
                    className="block rounded-lg border border-zinc-200 bg-white p-4 shadow-sm hover:border-zinc-300"
                  >
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
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
