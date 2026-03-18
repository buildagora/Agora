"use client";

/**
 * Landing Page – Search-first, non-functional product demo.
 * Illustrates how supplier responses work across a network.
 */

import Link from "next/link";
import AgoraLogo from "@/components/brand/AgoraLogo";
import Button from "@/components/ui2/Button";

const SUPPLIER_ROWS = [
  {
    supplier: "ABC Supply",
    initials: "ABC",
    logoClass: "bg-red-50 border-red-200 text-red-600",
    status: "In Stock",
    statusClass: "bg-emerald-50 text-emerald-800 border-emerald-200",
    product: "Landmark Pro Moire Black",
    detail: "92 bundles available · Pickup tomorrow morning",
  },
  {
    supplier: "SRS",
    initials: "SRS",
    logoClass: "bg-slate-100 border-slate-200 text-slate-700",
    status: "Out of Stock",
    statusClass: "bg-red-50 text-red-700 border-red-200",
    product: "Landmark Pro Moire Black",
    detail: "Not currently available at this branch",
  },
  {
    supplier: "QXO",
    initials: "QXO",
    logoClass: "bg-indigo-50 border-indigo-200 text-indigo-800",
    status: "Checking",
    statusClass: "bg-slate-100 text-slate-600 border-slate-200",
    product: "Landmark Pro Moire Black",
    detail: "Confirming branch availability",
  },
];

const NETWORK_SUPPLIERS = ["ABC Supply", "SRS", "QXO", "Lansing", "Gulf Eagle"];

export default function LandingPageClient() {
  return (
    <div className="bg-white min-h-screen">
      {/* Top Nav */}
      <nav className="w-full border-b border-zinc-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <AgoraLogo variant="auth" />
            <Link href="/auth/sign-in">
              <Button variant="outline" size="md">
                Sign In
              </Button>
            </Link>
          </div>
        </div>
      </nav>

      <main>
        {/* Hero */}
        <section className="max-w-3xl mx-auto px-4 sm:px-6 pt-16 pb-12 text-center">
          <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight text-black mb-4">
            Find building materials across your network.
          </h1>
          <p className="text-lg text-zinc-600 mb-10">
            Search across your supplier network.
          </p>

          {/* Static search bar (non-functional demo) */}
          <div className="w-full max-w-2xl mx-auto">
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-zinc-300 bg-white text-left">
              <svg className="w-5 h-5 text-zinc-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-zinc-100 text-zinc-700 border border-zinc-200 shrink-0">
                Roofing
              </span>
              <span className="h-4 w-px bg-zinc-200 shrink-0" aria-hidden />
              <span className="text-zinc-500 truncate">
                Landmark Pro Moire Black
              </span>
            </div>
          </div>
        </section>

        {/* Arrow: search bar → supplier response */}
        <div className="flex justify-center py-2">
          <svg className="w-5 h-5 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
          </svg>
        </div>

        {/* Supplier response preview – stacked rows */}
        <section className="max-w-3xl mx-auto px-4 sm:px-6 pb-12">
          <h2 className="text-xl font-semibold text-black mb-2">
            How supplier responses appear
          </h2>
          <p className="text-sm text-zinc-600 mb-6">
            Each supplier responds based on inventory and availability.
          </p>
          <div className="rounded-xl border border-zinc-200 bg-white shadow-sm overflow-hidden">
            {SUPPLIER_ROWS.map((row, i) => (
              <div
                key={row.supplier}
                className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-5 py-4 ${i < SUPPLIER_ROWS.length - 1 ? "border-b border-zinc-100" : ""}`}
              >
                <div className="flex gap-3 min-w-0 flex-1">
                  <div
                    className={`shrink-0 w-10 h-10 rounded-lg border flex items-center justify-center text-xs font-semibold ${row.logoClass}`}
                    aria-hidden
                  >
                    {row.initials}
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <p className="font-semibold text-black">{row.supplier}</p>
                      <span className="text-xs text-zinc-400">Network supplier</span>
                    </div>
                    <p className="font-medium text-zinc-900 text-sm sm:text-base mt-0.5">{row.product}</p>
                    <p className="text-sm text-zinc-500 mt-1">{row.detail}</p>
                  </div>
                </div>
                <span
                  className={`shrink-0 self-start sm:self-center px-2.5 py-1 rounded-md text-xs font-medium border ${row.statusClass}`}
                >
                  {row.status}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* Arrow: supplier response → network */}
        <div className="flex justify-center py-2">
          <svg className="w-5 h-5 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
          </svg>
        </div>

        {/* Centered network illustration + process copy */}
        <section className="max-w-3xl mx-auto px-4 sm:px-6 pt-0 pb-16 text-center">
          <div className="flex flex-col items-center">
            {/* YOU node (top) */}
            <div className="px-4 py-1.5 rounded-full bg-white border border-zinc-200 shadow-sm">
              <span className="text-xs font-medium text-zinc-700">YOU</span>
            </div>
            {/* Vertical line: YOU → Agora */}
            <div className="w-[1.5px] h-4 bg-blue-400 my-0.5" aria-hidden />
            {/* Agora node (hub) */}
            <div className="px-6 py-2.5 rounded-full bg-white border border-zinc-200 shadow-sm">
              <span className="text-sm font-medium text-black">Agora</span>
            </div>
            {/* Connector lines: Agora → supplier row */}
            <svg className="w-64 h-12 mt-0 text-blue-400" viewBox="0 0 256 48" preserveAspectRatio="none" aria-hidden>
              {[0.1, 0.3, 0.5, 0.7, 0.9].map((x, i) => (
                <line
                  key={i}
                  x1="128"
                  y1="0"
                  x2={x * 256}
                  y2="48"
                  stroke="currentColor"
                  strokeWidth="1.5"
                />
              ))}
            </svg>
            {/* Horizontal row of supplier nodes */}
            <div className="flex flex-wrap justify-center gap-2 sm:gap-3">
              {NETWORK_SUPPLIERS.map((label) => (
                <span
                  key={label}
                  className="inline-flex items-center justify-center px-3 py-1.5 min-w-0 rounded-full text-xs font-medium bg-white text-zinc-700 border border-zinc-200 shadow-sm whitespace-nowrap"
                >
                  {label}
                </span>
              ))}
            </div>
            {/* Centered process copy */}
            <h2 className="text-2xl md:text-3xl font-semibold text-zinc-800 mt-10 mb-5">
              Search → Discover → Source
            </h2>
            <div className="space-y-3 text-base md:text-lg text-zinc-600">
              <p>Search what you need</p>
              <p>See what&apos;s available across suppliers</p>
              <p>Get it from wherever makes sense</p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
