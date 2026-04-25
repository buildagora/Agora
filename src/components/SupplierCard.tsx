"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { SupplierCard as SupplierCardData } from "@/lib/search/types";

const STATUS_LABEL = {
  likely: "Likely match",
  unknown: "Possible match",
  unlikely: "Unlikely match",
} as const;

function formatCategory(raw: string): string {
  if (!raw) return "";
  return raw
    .toLowerCase()
    .split("_")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" & ");
}

export type SupplierCardProps = {
  card: SupplierCardData;
  /** Original chat query — sent as `requestText` on the material request. */
  requestText: string;
  /**
   * Category to record on the material request. Falls back to the supplier's
   * own category if the search couldn't infer one.
   */
  searchCategory?: string | null;
};

export default function SupplierCard({
  card,
  requestText,
  searchCategory,
}: SupplierCardProps) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dim = card.status === "unlikely";
  const dotColor =
    card.status === "likely"
      ? "bg-emerald-500"
      : card.status === "unknown"
      ? "bg-zinc-400"
      : "bg-zinc-300";

  const sendRequest = async () => {
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const categoryId =
        (searchCategory && searchCategory.trim()) || card.category;
      const res = await fetch("/api/buyer/material-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          categoryId,
          requestText,
          sendMode: "DIRECT",
          supplierIds: [card.supplierId],
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        throw new Error(data?.message || `HTTP ${res.status}`);
      }
      const requestId = data.materialRequestId ?? data.data?.materialRequestId;
      if (!requestId) throw new Error("No requestId in response");
      router.push(`/request/${requestId}`);
    } catch (e: any) {
      setError(e?.message || "Couldn't send request");
      setSubmitting(false);
    }
  };

  return (
    <article
      className={`flex flex-col gap-2 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md ${
        dim ? "opacity-70" : ""
      }`}
    >
      <header className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-[16px] font-medium text-zinc-900 sm:text-[17px]">
            {card.name}
          </h3>
          <p className="mt-0.5 text-xs text-zinc-500 sm:text-[13px]">
            {formatCategory(card.category)}
            {" · "}
            {card.distanceMiles.toFixed(1)} mi
            {" · "}
            {card.city}, {card.state}
          </p>
        </div>
        {card.status && (
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-zinc-50 px-2.5 py-1 text-[11px] text-zinc-600">
            <span className={`h-1.5 w-1.5 rounded-full ${dotColor}`} aria-hidden />
            {STATUS_LABEL[card.status]}
          </span>
        )}
      </header>

      {card.note && (
        <p className="text-sm leading-relaxed text-zinc-700">{card.note}</p>
      )}

      <div className="mt-1 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-500 sm:text-[13px]">
          {card.phone && (
            <a
              href={`tel:${card.phone.replace(/[^\d+]/g, "")}`}
              className="inline-flex items-center gap-1 text-zinc-700 transition hover:text-zinc-900"
            >
              <PhoneIcon className="h-3.5 w-3.5" />
              {card.phone}
            </a>
          )}
          {card.sourceUrl && (
            <a
              href={card.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-zinc-500 underline-offset-2 transition hover:text-zinc-700 hover:underline"
            >
              <LinkIcon className="h-3.5 w-3.5" />
              source
            </a>
          )}
        </div>

        <button
          type="button"
          onClick={sendRequest}
          disabled={submitting}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-zinc-900 px-3.5 py-1.5 text-xs font-medium text-white transition hover:bg-zinc-800 disabled:cursor-wait disabled:bg-zinc-400 sm:text-[13px]"
        >
          {submitting ? "Sending…" : "Send request →"}
        </button>
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}
    </article>
  );
}

function PhoneIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  );
}

function LinkIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}
