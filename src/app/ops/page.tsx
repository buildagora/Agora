"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
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

function sortNewestFirst(a: MaterialRequestRow, b: MaterialRequestRow): number {
  return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
}

function isNeedsAttention(r: MaterialRequestRow): boolean {
  return (
    r.opsStatus === "NEW" ||
    r.emailStatus === "FAILED" ||
    r.emailStatus === "OUTBOX"
  );
}

/** One row per section: needs attention first, then in-progress, then completed. */
function partitionRows(rows: MaterialRequestRow[]) {
  const needsAttentionRows = [...rows].filter(isNeedsAttention).sort(sortNewestFirst);
  const naIds = new Set(needsAttentionRows.map((x) => x.id));

  const inProgressRows = [...rows]
    .filter((r) => !naIds.has(r.id) && r.opsStatus === "IN_PROGRESS")
    .sort(sortNewestFirst);

  const completedRows = [...rows]
    .filter((r) => !naIds.has(r.id) && r.opsStatus === "COMPLETED")
    .sort(sortNewestFirst);

  return { needsAttentionRows, inProgressRows, completedRows };
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

function RequestCard({
  r,
  onStart,
  onComplete,
}: {
  r: MaterialRequestRow;
  onStart: (id: string) => void;
  onComplete: (id: string) => void;
}) {
  const category =
    categoryIdToLabel[r.categoryId as keyof typeof categoryIdToLabel] ??
    r.categoryId;
  const { totalRecipients, repliedCount, pendingCount, declinedCount } = r.counts;

  return (
    <li className="rounded-lg border border-zinc-200 bg-white shadow-sm">
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
            total {totalRecipients} · available {repliedCount} · checking{" "}
            {pendingCount} · unavailable {declinedCount}
          </p>
        </Link>
        <div className="flex shrink-0 flex-row gap-2 border-t border-zinc-100 p-3 sm:flex-col sm:border-l sm:border-t-0 sm:py-4">
          <button
            type="button"
            onClick={() => onStart(r.id)}
            className="rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-800 hover:bg-zinc-50"
          >
            Start
          </button>
          <button
            type="button"
            onClick={() => onComplete(r.id)}
            className="rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-800 hover:bg-zinc-50"
          >
            Complete
          </button>
        </div>
      </div>
    </li>
  );
}

type ColumnKey = "needsAttention" | "inProgress" | "completed";

function OpsBoardSections({
  needsAttentionRows,
  inProgressRows,
  completedRows,
  showCompleted,
  setShowCompleted,
  setOpsStatus,
}: {
  needsAttentionRows: MaterialRequestRow[];
  inProgressRows: MaterialRequestRow[];
  completedRows: MaterialRequestRow[];
  showCompleted: boolean;
  setShowCompleted: Dispatch<SetStateAction<boolean>>;
  setOpsStatus: (id: string, s: "NEW" | "IN_PROGRESS" | "COMPLETED") => Promise<void>;
}) {
  const onStart = (id: string) => void setOpsStatus(id, "IN_PROGRESS");
  const onComplete = (id: string) => void setOpsStatus(id, "COMPLETED");

  const visibleKeys: ColumnKey[] = [];
  if (needsAttentionRows.length > 0) visibleKeys.push("needsAttention");
  if (inProgressRows.length > 0) visibleKeys.push("inProgress");
  if (completedRows.length > 0) visibleKeys.push("completed");

  const lgGridClass =
    visibleKeys.length >= 3
      ? "lg:grid-cols-3"
      : visibleKeys.length === 2
        ? "lg:grid-cols-2"
        : visibleKeys.length === 1
          ? "lg:grid-cols-1"
          : "";

  const renderColumn = (key: ColumnKey) => {
    if (key === "needsAttention" && needsAttentionRows.length === 0) return null;
    if (key === "inProgress" && inProgressRows.length === 0) return null;
    if (key === "completed" && completedRows.length === 0) return null;

    const list =
      key === "needsAttention"
        ? needsAttentionRows
        : key === "inProgress"
          ? inProgressRows
          : completedRows;

    const title =
      key === "needsAttention"
        ? "Needs attention"
        : key === "inProgress"
          ? "In progress"
          : "Completed";

    const prominent = key === "needsAttention";

    return (
      <section
        key={key}
        className={`min-w-0 space-y-3 lg:rounded-xl lg:border lg:p-3 lg:shadow-sm ${
          prominent
            ? "lg:border-amber-200/90 lg:bg-amber-50/50 lg:ring-2 lg:ring-amber-200/70"
            : "lg:border-zinc-200/80 lg:bg-zinc-50/70"
        }`}
      >
        {key === "completed" ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-zinc-800">
              {title}{" "}
              <span className="font-normal text-zinc-500">({list.length})</span>
            </h2>
            <button
              type="button"
              onClick={() => setShowCompleted((v) => !v)}
              className="text-xs font-medium text-zinc-600 underline-offset-2 hover:text-zinc-900 hover:underline"
            >
              {showCompleted ? "Hide completed" : "Show completed"}
            </button>
          </div>
        ) : (
          <h2 className="text-sm font-semibold text-zinc-800">
            {title}{" "}
            <span className="font-normal text-zinc-500">({list.length})</span>
          </h2>
        )}

        {key === "completed" ? (
          showCompleted && (
            <ul className="space-y-3">
              {list.map((r) => (
                <RequestCard key={r.id} r={r} onStart={onStart} onComplete={onComplete} />
              ))}
            </ul>
          )
        ) : (
          <ul className="space-y-3">
            {list.map((r) => (
              <RequestCard key={r.id} r={r} onStart={onStart} onComplete={onComplete} />
            ))}
          </ul>
        )}
      </section>
    );
  };

  return (
    <div
      className={`flex min-w-0 flex-col gap-10 lg:grid lg:items-start lg:gap-4 ${lgGridClass}`}
    >
      {visibleKeys.map((k) => renderColumn(k))}
    </div>
  );
}

/**
 * Operator dashboard: material requests.
 * GET /api/ops/material-requests (same JSON base shape + opsStatus / emailStatus).
 */
export default function OpsMaterialRequestsPage() {
  const [rows, setRows] = useState<MaterialRequestRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);

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

    setRows(json.data);
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

  const { needsAttentionRows, inProgressRows, completedRows } = useMemo(
    () =>
      rows && rows.length > 0
        ? partitionRows(rows)
        : {
            needsAttentionRows: [] as MaterialRequestRow[],
            inProgressRows: [] as MaterialRequestRow[],
            completedRows: [] as MaterialRequestRow[],
          },
    [rows]
  );

  return (
    <div className="min-h-screen bg-zinc-50 py-10 px-4">
      <div className="mx-auto w-full min-w-0 max-w-2xl space-y-6 lg:max-w-7xl">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">
            Material requests
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            New and retrying requests appear at the top.
          </p>
        </div>

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
          <OpsBoardSections
            needsAttentionRows={needsAttentionRows}
            inProgressRows={inProgressRows}
            completedRows={completedRows}
            showCompleted={showCompleted}
            setShowCompleted={setShowCompleted}
            setOpsStatus={setOpsStatus}
          />
        )}
      </div>
    </div>
  );
}
