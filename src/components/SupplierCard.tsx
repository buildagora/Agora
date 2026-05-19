"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { SupplierCard as SupplierCardData } from "@/lib/search/types";

type Confidence = "high" | "medium" | "low";

const CONFIDENCE_DISPLAY: Record<
  Confidence,
  { label: string; dotClass: string; pillClass: string }
> = {
  high: {
    label: "Strong match",
    dotClass: "bg-emerald-500",
    pillClass: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  },
  medium: {
    label: "Likely match",
    dotClass: "bg-amber-500",
    pillClass: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
  },
  low: {
    label: "Possible match",
    dotClass: "bg-zinc-400",
    pillClass: "bg-zinc-50 text-zinc-600 ring-1 ring-zinc-200",
  },
};

const LIVE_CATALOG_DISPLAY = {
  label: "Live catalog",
  dotClass: "bg-sky-500",
  pillClass: "bg-sky-50 text-sky-700 ring-1 ring-sky-200",
};

function formatCategory(raw: string): string {
  if (!raw) return "";
  return raw
    .toLowerCase()
    .split("_")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" & ");
}

function initials(name: string): string {
  const parts = name
    .replace(/[^\w\s]/g, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export type SupplierCardProps = {
  card: SupplierCardData;
  threadId: string;
  searchId: string;
};

/**
 * Click target uses the layered-link pattern: an absolutely-positioned
 * `<button>` covers the whole card (z-0), and any future inner anchors can
 * sit above it with `relative z-10`. We deliberately removed phone/source
 * links — they encouraged buyers to bypass the in-app flow, and the click
 * target should always land them on the supplier detail page where the
 * operator-mediated flow happens.
 */
export default function SupplierCard({
  card,
  threadId,
  searchId,
}: SupplierCardProps) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isLive = card.kind === "live-catalog";
  const badge = isLive
    ? LIVE_CATALOG_DISPLAY
    : card.confidence
    ? CONFIDENCE_DISPLAY[card.confidence]
    : null;

  const handleSelect = async () => {
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(
        `/api/search/${encodeURIComponent(threadId)}/${encodeURIComponent(searchId)}/select-supplier`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ supplierId: card.supplierId }),
        }
      );
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        throw new Error(data?.message || `HTTP ${res.status}`);
      }
      router.push(
        `/request/${encodeURIComponent(data.materialRequestId)}/supplier/${encodeURIComponent(card.supplierId)}`
      );
    } catch (e: any) {
      setError(e?.message || "Couldn't open supplier");
      setSubmitting(false);
    }
  };

  return (
    <article
      className={`group relative flex gap-4 overflow-hidden rounded-2xl border bg-white p-5 shadow-sm transition-all hover:-translate-y-px hover:shadow-md focus-within:shadow-md sm:p-6 ${
        isLive
          ? "border-sky-200 hover:border-sky-300"
          : "border-zinc-200 hover:border-zinc-300"
      } ${submitting ? "pointer-events-none opacity-60" : ""}`}
    >
      {/* Left-edge accent for live-catalog cards */}
      {isLive && (
        <span
          className="absolute left-0 top-0 h-full w-1 bg-sky-400"
          aria-hidden
        />
      )}

      {/* Cover button — sibling of visible content. */}
      <button
        type="button"
        onClick={handleSelect}
        disabled={submitting}
        aria-label={`See ${isLive ? `live ${card.name} catalog` : `products at ${card.name}`}`}
        className="absolute inset-0 z-0 rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-zinc-900 disabled:cursor-wait"
      />

      <SupplierAvatar
        name={card.name}
        logoUrl={card.logoUrl}
        live={isLive}
      />

      <div className="relative flex min-w-0 flex-1 flex-col gap-2">
        <header className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-[17px] font-semibold text-zinc-900 group-hover:underline group-hover:underline-offset-2 sm:text-[18px]">
              {card.name}
            </h3>
            <p className="mt-0.5 truncate text-xs text-zinc-500 sm:text-[13px]">
              {formatCategory(card.category)}
              {" · "}
              <span className="font-medium text-zinc-700">
                {card.distanceMiles.toFixed(1)} mi
              </span>
              {" · "}
              {card.city}, {card.state}
            </p>
          </div>
          {badge && (
            <span
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ${badge.pillClass}`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${badge.dotClass}`}
                aria-hidden
              />
              {badge.label}
            </span>
          )}
        </header>

        {card.note && (
          <p className="text-[13px] leading-relaxed text-zinc-600 sm:text-sm">
            {card.note}
          </p>
        )}

        {error && (
          <p className="text-xs text-red-600" role="alert">
            {error}
          </p>
        )}

        <footer className="mt-1 flex items-center justify-end text-xs text-zinc-500 transition group-hover:text-zinc-900 sm:text-[13px]">
          <span className="inline-flex items-center gap-1">
            {submitting ? "Opening…" : "See products"}
            <ArrowRightIcon className="h-3.5 w-3.5" />
          </span>
        </footer>
      </div>
    </article>
  );
}

function SupplierAvatar({
  name,
  logoUrl,
  live,
}: {
  name: string;
  logoUrl: string | null | undefined;
  live: boolean;
}) {
  const [broken, setBroken] = useState(false);
  if (logoUrl && !broken) {
    return (
      <div className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-zinc-50 ring-1 ring-zinc-200 sm:h-14 sm:w-14">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={logoUrl}
          alt=""
          loading="lazy"
          className="h-full w-full object-contain p-1"
          onError={() => setBroken(true)}
        />
      </div>
    );
  }
  return (
    <div
      className={`relative flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-sm font-semibold ring-1 sm:h-14 sm:w-14 sm:text-base ${
        live
          ? "bg-sky-50 text-sky-700 ring-sky-200"
          : "bg-zinc-50 text-zinc-600 ring-zinc-200"
      }`}
      aria-hidden
    >
      {initials(name)}
    </div>
  );
}

function ArrowRightIcon({ className }: { className?: string }) {
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
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}
