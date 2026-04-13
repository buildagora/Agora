"use client";

/**
 * Landing Page – search-first discovery (public). Results are read-only; requests require an account.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import AgoraLogo from "@/components/brand/AgoraLogo";
import Button from "@/components/ui2/Button";
import Card, { CardContent } from "@/components/ui2/Card";
import { trackEvent } from "@/lib/analytics/client";
import { ANALYTICS_EVENTS } from "@/lib/analytics/events";
import { BUYER_CATEGORY_OPTIONS } from "@/lib/categoryDisplay";
import { categoryIdToLabel } from "@/lib/categoryIds";

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

interface DiscoverySupplier {
  id: string;
  name: string;
  categories: string[];
}

export default function LandingPageClient() {
  const pathname = usePathname();
  const page = pathname || "/";
  const landingViewedRef = useRef(false);

  const [selectedCategory, setSelectedCategory] = useState("");
  const [queryText, setQueryText] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [discoveryError, setDiscoveryError] = useState<string | null>(null);
  const [suppliers, setSuppliers] = useState<DiscoverySupplier[]>([]);
  const [lastSearchCategory, setLastSearchCategory] = useState("");
  const [lastSearchQuery, setLastSearchQuery] = useState("");

  useEffect(() => {
    if (landingViewedRef.current) return;
    landingViewedRef.current = true;
    trackEvent(ANALYTICS_EVENTS.landing_viewed, {
      page,
      location: "landing",
    });
  }, [page]);

  useEffect(() => {
    const prevBodyBg = document.body.style.backgroundColor;
    const prevHtmlBg = document.documentElement.style.backgroundColor;
    document.body.style.backgroundColor = "#ffffff";
    document.documentElement.style.backgroundColor = "#ffffff";
    return () => {
      document.body.style.backgroundColor = prevBodyBg;
      document.documentElement.style.backgroundColor = prevHtmlBg;
    };
  }, []);

  const trackNavbarSignInClick = () => {
    trackEvent(ANALYTICS_EVENTS.landing_cta_clicked, {
      location: "navbar",
      page,
      role_intent: "unknown",
    });
    trackEvent(ANALYTICS_EVENTS.login_clicked, {
      location: "navbar",
      page,
    });
  };

  const signupHrefFromSearch =
    lastSearchCategory && lastSearchQuery
      ? `/auth/sign-up?categoryId=${encodeURIComponent(lastSearchCategory)}&q=${encodeURIComponent(lastSearchQuery)}`
      : "/auth/sign-up";

  const trackDiscoverySignupClick = () => {
    trackEvent(ANALYTICS_EVENTS.landing_discovery_signup_clicked, {
      location: "discovery_results",
      page,
      category_id: lastSearchCategory || null,
    });
  };

  const trackNavbarCreateAccountClick = () => {
    trackEvent(ANALYTICS_EVENTS.landing_nav_create_account_clicked, {
      location: "navbar",
      page,
      category_id: lastSearchCategory || null,
    });
  };

  const handleSearchMaterials = () => {
    setValidationError(null);
    setDiscoveryError(null);

    if (!selectedCategory) {
      setValidationError("Please select a category.");
      return;
    }
    const q = queryText.trim();
    if (!q) {
      setValidationError("Please enter what you’re looking for.");
      return;
    }

    setHasSearched(true);
    setLoading(true);
    setSuppliers([]);
    setLastSearchCategory(selectedCategory);
    setLastSearchQuery(q);

    trackEvent(ANALYTICS_EVENTS.landing_search_started, {
      location: "landing",
      page,
      category_id: selectedCategory,
      query_length: q.length,
    });

    const url = `/api/public/suppliers/discovery?categoryId=${encodeURIComponent(selectedCategory)}`;

    fetch(url, { cache: "no-store" })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          const msg =
            typeof data?.message === "string"
              ? data.message
              : typeof data?.error === "string"
                ? data.error
                : "Could not load suppliers. Please try again.";
          throw new Error(msg);
        }
        if (data.ok && Array.isArray(data.suppliers)) {
          return data.suppliers as DiscoverySupplier[];
        }
        return [];
      })
      .then((list) => {
        setSuppliers(list);
      })
      .catch((err) => {
        console.error("[landing_discovery]", err);
        setDiscoveryError(err instanceof Error ? err.message : "Something went wrong.");
        setSuppliers([]);
      })
      .finally(() => {
        setLoading(false);
      });
  };

  const showNoSuppliers =
    hasSearched && !loading && !discoveryError && suppliers.length === 0;

  return (
    <div className="bg-white min-h-screen">
      {/* Top Nav */}
      <nav className="w-full border-b border-zinc-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <AgoraLogo variant="auth" />
            <div className="flex items-center gap-2 sm:gap-3">
              <Link href="/auth/sign-in" onClick={trackNavbarSignInClick}>
                <Button
                  variant="outline"
                  size="md"
                  className="bg-white text-slate-700 border-slate-600 hover:bg-slate-50"
                >
                  Sign In
                </Button>
              </Link>
              <Link href={signupHrefFromSearch} onClick={trackNavbarCreateAccountClick}>
                <Button variant="primary" size="md" className="font-semibold shadow-sm">
                  Create Account
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </nav>

      <main>
        {/* Hero */}
        <section className="max-w-3xl mx-auto px-4 sm:px-6 pt-12 sm:pt-16 pb-6 sm:pb-8 text-center">
          <h1 className="text-3xl sm:text-5xl font-semibold tracking-tight text-black mb-4 leading-tight">
            Stop calling suppliers to find material
          </h1>
          <p className="text-base sm:text-lg text-zinc-600 mb-6 sm:mb-8 max-w-xl mx-auto leading-relaxed">
            Search for materials. Instantly see which suppliers have it.
          </p>

          <Card className="border-zinc-200 border-2 shadow-md text-left max-w-2xl mx-auto ring-1 ring-zinc-100">
            <CardContent className="p-5 sm:p-6 space-y-4">
              <div>
                <label htmlFor="landing-category" className="block text-sm font-medium text-black mb-2">
                  Category
                </label>
                <select
                  id="landing-category"
                  value={selectedCategory}
                  onChange={(e) => {
                    setSelectedCategory(e.target.value);
                    setValidationError(null);
                  }}
                  className="w-full px-4 py-2.5 border border-zinc-300 rounded-lg bg-white text-black focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent"
                >
                  <option value="">Select a category…</option>
                  {BUYER_CATEGORY_OPTIONS.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="landing-query" className="block text-sm font-medium text-black mb-2">
                  What do you need?
                </label>
                <input
                  id="landing-query"
                  type="text"
                  value={queryText}
                  onChange={(e) => {
                    setQueryText(e.target.value);
                    setValidationError(null);
                  }}
                  placeholder="e.g. Landmark Pro shingles, quantities, delivery window…"
                  className="w-full px-4 py-2.5 border border-zinc-300 rounded-lg bg-white text-black focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent"
                  autoComplete="off"
                />
              </div>
              {(validationError || discoveryError) && (
                <p className="text-sm text-red-600" role="alert">
                  {validationError || discoveryError}
                </p>
              )}
              <Button
                type="button"
                variant="primary"
                size="lg"
                className="w-full min-h-[52px] text-base font-semibold shadow-md hover:shadow-lg focus:ring-offset-2"
                disabled={loading}
                onClick={handleSearchMaterials}
              >
                {loading ? "Searching…" : "Search suppliers"}
              </Button>
              <p className="text-xs text-zinc-500 text-center sm:text-left">
                Browse with no account. Free signup only when you send a request.
              </p>
            </CardContent>
          </Card>
        </section>

        {/* Discovery results */}
        {hasSearched && (
          <section className="max-w-3xl mx-auto px-4 sm:px-6 pb-10 sm:pb-12">
            <h2 className="text-xl font-semibold text-black mb-2">
              Who can help right now
              {!loading && !discoveryError && suppliers.length > 0 && (
                <span className="font-normal text-zinc-600"> · {suppliers.length} supplier{suppliers.length !== 1 ? "s" : ""}</span>
              )}
            </h2>
            <p className="text-sm text-zinc-600 mb-5 leading-relaxed">
              Results are instant—no signup to discover. Create a free account only when you&apos;re ready to send your request.
            </p>

            {loading && (
              <div className="py-12 text-center text-sm text-zinc-600 rounded-xl border border-zinc-200 bg-zinc-50/50">
                Finding suppliers…
              </div>
            )}

            {!loading && discoveryError && (
              <div className="py-10 px-4 text-center text-sm text-red-600 rounded-xl border border-red-200 bg-red-50/50">
                {discoveryError}
              </div>
            )}

            {showNoSuppliers && (
              <div className="py-10 px-4 text-center text-sm text-zinc-600 rounded-xl border border-zinc-200 bg-zinc-50/50 space-y-4">
                <p>No suppliers found in this category yet. Try another category or check back soon.</p>
                <Link href={signupHrefFromSearch} onClick={trackDiscoverySignupClick} className="inline-block">
                  <Button variant="primary" size="lg" className="min-h-[48px] font-semibold shadow-sm">
                    Create free account to send request
                  </Button>
                </Link>
              </div>
            )}

            {!loading && !discoveryError && suppliers.length > 0 && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
                  {suppliers.map((supplier) => (
                    <Card key={supplier.id} className="border-zinc-200 bg-white">
                      <CardContent className="p-4">
                        <h3 className="text-sm font-semibold text-black">{supplier.name}</h3>
                        {supplier.categories.length > 0 && (
                          <p className="text-xs text-zinc-500 mt-1">
                            {supplier.categories
                              .map(
                                (cat) =>
                                  categoryIdToLabel[cat as keyof typeof categoryIdToLabel] || cat
                              )
                              .join(", ")}
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
                <div className="rounded-xl border-2 border-zinc-200 bg-zinc-50 p-6 text-center space-y-4 shadow-sm">
                  <p className="text-sm font-medium text-zinc-900">
                    Ready to reach them? One free account unlocks sending.
                  </p>
                  <Link href={signupHrefFromSearch} onClick={trackDiscoverySignupClick} className="inline-block w-full sm:w-auto">
                    <Button variant="primary" size="lg" className="w-full min-h-[48px] font-semibold shadow-md">
                      Create free account to send request
                    </Button>
                  </Link>
                </div>
              </>
            )}

          </section>
        )}

        {/* Lighter “how it works” preview only before first search—avoids competing with results + CTA */}
        {!hasSearched && (
          <>
            <div className="flex justify-center py-1">
              <svg className="w-5 h-5 text-zinc-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
              </svg>
            </div>

            <section className="max-w-3xl mx-auto px-4 sm:px-6 pb-6 sm:pb-8">
              <p className="text-center text-xs font-medium uppercase tracking-wider text-zinc-400 mb-4">
                How responses look on Agora
              </p>
              <div className="rounded-xl border border-zinc-100 bg-zinc-50/60 overflow-hidden opacity-90">
                {SUPPLIER_ROWS.map((row, i) => (
                  <div
                    key={row.supplier}
                    className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-4 py-3 ${i < SUPPLIER_ROWS.length - 1 ? "border-b border-zinc-100/80" : ""}`}
                  >
                    <div className="flex gap-2.5 min-w-0 flex-1">
                      <div
                        className={`shrink-0 w-9 h-9 rounded-lg border flex items-center justify-center text-[10px] font-semibold ${row.logoClass}`}
                        aria-hidden
                      >
                        {row.initials}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-black">{row.supplier}</p>
                        <p className="text-xs text-zinc-500 mt-0.5 line-clamp-1">{row.product}</p>
                      </div>
                    </div>
                    <span
                      className={`shrink-0 self-start sm:self-center px-2 py-0.5 rounded text-[10px] font-medium border ${row.statusClass}`}
                    >
                      {row.status}
                    </span>
                  </div>
                ))}
              </div>
            </section>

            <section className="max-w-lg mx-auto px-4 sm:px-6 pt-2 pb-10 sm:pb-12 text-center">
              <p className="text-xs text-zinc-400 mb-3">One search, many suppliers</p>
              <div className="flex flex-wrap justify-center gap-1.5">
                {NETWORK_SUPPLIERS.map((label) => (
                  <span
                    key={label}
                    className="inline-flex px-2.5 py-1 rounded-full text-[10px] font-medium bg-zinc-50 text-zinc-500 border border-zinc-100"
                  >
                    {label}
                  </span>
                ))}
              </div>
            </section>
          </>
        )}

        <section className="border-t border-zinc-200 bg-zinc-50/80">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 py-16 sm:py-20 lg:py-24 space-y-20 sm:space-y-24">

            {/* 1. How Agora Works */}
            <div>
              <div className="text-center max-w-2xl mx-auto mb-8 sm:mb-10">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500 mb-3">
                  Simple workflow
                </p>
                <h2 className="text-2xl sm:text-3xl font-semibold text-black tracking-tight">
                  How Agora Works
                </h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-5">
                <Card className="border-zinc-200/90 bg-white shadow-sm ring-1 ring-zinc-100">
                  <CardContent className="p-5 sm:p-6">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 mb-2">
                      Step 1
                    </p>
                    <h3 className="text-base font-semibold text-black mb-2">
                      Search for what you need
                    </h3>
                    <p className="text-sm text-zinc-600 leading-relaxed">
                      Search or enter what you need—materials, quantities, and timing—in one request.
                    </p>
                  </CardContent>
                </Card>
                <Card className="border-zinc-200/90 bg-white shadow-sm ring-1 ring-zinc-100">
                  <CardContent className="p-5 sm:p-6">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 mb-2">
                      Step 2
                    </p>
                    <h3 className="text-base font-semibold text-black mb-2">
                      Suppliers respond
                    </h3>
                    <p className="text-sm text-zinc-600 leading-relaxed">
                      Multiple suppliers return pricing and availability so you can compare without chasing callbacks.
                    </p>
                  </CardContent>
                </Card>
                <Card className="border-zinc-200/90 bg-white shadow-sm ring-1 ring-zinc-100">
                  <CardContent className="p-5 sm:p-6">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 mb-2">
                      Step 3
                    </p>
                    <h3 className="text-base font-semibold text-black mb-2">
                      Move forward faster
                    </h3>
                    <p className="text-sm text-zinc-600 leading-relaxed">
                      Pick the best option and keep the job moving—less phone tag, fewer wasted trips.
                    </p>
                  </CardContent>
                </Card>
              </div>
            </div>

            {/* 2. Why Contractors Use Agora + comparison */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-14 lg:items-stretch">
              <div className="text-left space-y-5">
                <h2 className="text-2xl sm:text-3xl font-semibold text-black tracking-tight">
                  Why Contractors Use Agora
                </h2>
                <p className="text-sm sm:text-base text-zinc-600 leading-relaxed max-w-md">
                  Replace endless calling with one request and structured answers—built for how crews actually buy materials.
                </p>
                <ul className="text-sm text-zinc-700 space-y-2.5 max-w-lg pt-1">
                  <li className="flex gap-2">
                    <span className="text-zinc-400 shrink-0" aria-hidden>—</span>
                    <span>Stop wasting hours calling suppliers</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-zinc-400 shrink-0" aria-hidden>—</span>
                    <span>Get competitive pricing from multiple suppliers</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-zinc-400 shrink-0" aria-hidden>—</span>
                    <span>Know what’s in stock before you drive</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-zinc-400 shrink-0" aria-hidden>—</span>
                    <span>Reach more suppliers with a single request</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-zinc-400 shrink-0" aria-hidden>—</span>
                    <span>Make faster decisions and keep jobs moving</span>
                  </li>
                </ul>
              </div>

              <Card className="border-zinc-200 bg-white shadow-md ring-1 ring-zinc-100/80 h-full">
                <CardContent className="p-5 sm:p-6 flex flex-col h-full">
                  <h3 className="text-base font-semibold text-black mb-4 pb-3 border-b border-zinc-100">
                    The Old Way vs. Agora
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5 flex-1 text-sm">
                    <div className="rounded-lg bg-zinc-50 border border-zinc-100 p-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-3">
                        The Old Way
                      </p>
                      <ul className="space-y-2 text-zinc-600 leading-snug">
                        <li>Call 3–5 suppliers</li>
                        <li>Wait around for callbacks</li>
                        <li>Inconsistent pricing</li>
                        <li>Drive around just to check stock</li>
                      </ul>
                    </div>
                    <div className="rounded-lg bg-white border border-zinc-200 p-4 shadow-sm">
                      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-3">
                        Agora
                      </p>
                      <ul className="space-y-2 text-zinc-800 leading-snug">
                        <li>Send one request</li>
                        <li>Multiple suppliers respond</li>
                        <li>Pricing & availability upfront</li>
                        <li>Decide without the back-and-forth</li>
                      </ul>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* 3. Huntsville + CTA */}
            <div className="text-center max-w-xl mx-auto space-y-6 pt-2">
              <h2 className="text-2xl sm:text-3xl font-semibold text-black tracking-tight">
                Built for Contractors in Huntsville
              </h2>
              <p className="text-sm sm:text-[15px] text-zinc-600 leading-relaxed">
                Agora is building a local supply network in Huntsville so contractors can find materials faster, compare options more easily, and keep jobs moving without calling all over town.
              </p>
              <button
                type="button"
                onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
                className="inline-flex px-6 py-3 bg-black text-white rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity shadow-sm"
              >
                Find Pricing & Availability
              </button>
            </div>

          </div>
        </section>
      </main>
      <footer className="border-t border-zinc-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-6 flex items-center justify-center gap-2 text-sm text-zinc-600">
          <span>Need help?</span>
          <Link href="/support" className="font-medium text-zinc-900 hover:underline">
            Support
          </Link>
        </div>
      </footer>
    </div>
  );
}
