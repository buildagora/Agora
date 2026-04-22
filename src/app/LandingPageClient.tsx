"use client";

/**
 * Landing Page — public search to create a material request (anonymous allowed).
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import AgoraLogo from "@/components/brand/AgoraLogo";
import RecentSearchesDrawer from "@/components/layout/RecentSearchesDrawer";
import RecentSearchesSidebar from "@/components/layout/RecentSearchesSidebar";
import SiteHeader from "@/components/layout/SiteHeader";
import { useIsMobileMd } from "@/hooks/useIsMobileMd";
import { trackEvent } from "@/lib/analytics/client";
import { ANALYTICS_EVENTS } from "@/lib/analytics/events";
import { CATEGORY_OPTIONS } from "@/lib/categoryDisplay";

function SearchGlyph({ className }: { className?: string }) {
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
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

export default function LandingPageClient() {
  const pathname = usePathname();
  const page = pathname || "/";
  const landingViewedRef = useRef(false);
  const isMobile = useIsMobileMd();

  const [queryText, setQueryText] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("roofing");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

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

  const handleSearchMaterials = () => {
    if (!selectedCategory) return;

    setValidationError(null);
    setRequestError(null);

    const q = queryText.trim();
    if (!q) {
      setValidationError("Please enter what you need.");
      return;
    }

    setLoading(true);

    trackEvent(ANALYTICS_EVENTS.search_submitted, {
      location: "landing",
      page,
      category_id: selectedCategory,
      query_length: q.length,
    });

    fetch("/api/buyer/material-requests", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        categoryId: selectedCategory,
        requestText: queryText.trim(),
        sendMode: "NETWORK",
      }),
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok || !data.ok) {
          throw new Error(data?.message || "Failed to create request");
        }
        return data;
      })
      .then((data) => {
        const requestId = data.materialRequestId;
        const url = `/request/${requestId}`;

        try {
          const existing = JSON.parse(
            localStorage.getItem("agora:recent_searches") || "[]"
          );

          const newEntry = {
            id: requestId,
            text: queryText.trim(),
            url,
            createdAt: Date.now(),
          };

          const updated = [
            newEntry,
            ...existing.filter((e: { id: string }) => e.id !== requestId),
          ].slice(0, 10);

          localStorage.setItem(
            "agora:recent_searches",
            JSON.stringify(updated)
          );
        } catch {
          /* ignore */
        }

        window.location.href = url;
      })
      .catch((err) => {
        console.error("[landing_request]", err);
        setRequestError(
          err instanceof Error ? err.message : "Something went wrong."
        );
      })
      .finally(() => {
        setLoading(false);
      });
  };

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <SiteHeader drawerOpen={drawerOpen} onDrawerOpenChange={setDrawerOpen} />
      {isMobile && (
        <RecentSearchesDrawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
        />
      )}

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        {drawerOpen && (
          <aside className="hidden w-64 shrink-0 border-r border-zinc-200 bg-zinc-50 md:block md:self-stretch">
            <RecentSearchesSidebar />
          </aside>
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          <main className="flex min-h-0 w-full flex-1 flex-col items-center justify-center px-4 py-10 sm:px-6 sm:py-14 lg:px-8 lg:py-16">
            <section className="mx-auto flex w-full max-w-3xl flex-col items-center text-center">
              <div className="mb-5 flex w-full justify-center sm:mb-6">
                <AgoraLogo variant="hero" />
              </div>

              <h1 className="mb-4 w-full text-[18px] font-normal leading-snug text-zinc-600 sm:mb-5 sm:text-[22px]">
                Search for materials
              </h1>

              <div className="w-full">
                <div className="flex w-full min-w-0 items-center rounded-full border border-zinc-200 bg-white py-3 pl-3 pr-2 shadow-sm transition-shadow hover:shadow-md sm:pl-4">
                  <select
                    aria-label="Material category"
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                    className="min-w-[140px] shrink-0 cursor-pointer bg-transparent pr-2 text-[15px] text-zinc-700 outline-none sm:text-base"
                  >
                    {CATEGORY_OPTIONS.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <div
                    className="mx-2 h-6 w-px shrink-0 self-center bg-zinc-200"
                    aria-hidden
                  />
                  <input
                    type="text"
                    value={queryText}
                    onChange={(e) => {
                      setQueryText(e.target.value);
                      setValidationError(null);
                      setRequestError(null);
                    }}
                    placeholder="e.g. 30 squares of Landmark Pro Driftwood"
                    className="min-w-0 flex-1 bg-transparent text-base text-zinc-800 outline-none placeholder:text-zinc-400 sm:text-[17px]"
                  />
                  <div
                    className="mx-2 h-6 w-px shrink-0 self-center bg-zinc-200"
                    aria-hidden
                  />
                  <button
                    type="button"
                    onClick={handleSearchMaterials}
                    disabled={loading}
                    className="flex shrink-0 items-center justify-center rounded-full p-2.5 text-zinc-500 transition hover:bg-zinc-50 hover:text-zinc-800 disabled:opacity-50"
                    aria-label="Search"
                  >
                    <SearchGlyph className="h-5 w-5" />
                  </button>
                </div>

                {(validationError || requestError) && (
                  <p className="mt-3 text-center text-sm text-red-600">
                    {validationError || requestError}
                  </p>
                )}
              </div>
            </section>
          </main>
        </div>
      </div>

      <footer className="mt-auto w-full shrink-0 border-t border-zinc-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
          <div className="grid grid-cols-1 items-center gap-6 text-center text-xs leading-relaxed text-zinc-500 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:gap-x-8 sm:gap-y-0 sm:text-[13px]">
            <p className="sm:justify-self-start sm:text-left">
              Serving Huntsville & North Alabama
            </p>
            <p className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 sm:gap-x-3">
              <Link
                href="/how-it-works"
                className="text-inherit transition hover:opacity-70"
              >
                How It Works
              </Link>
              <span className="select-none text-zinc-300" aria-hidden>
                |
              </span>
              <Link
                href="/contact"
                className="text-inherit transition hover:opacity-70"
              >
                Contact Us
              </Link>
              <span className="select-none text-zinc-300" aria-hidden>
                |
              </span>
              <Link
                href="/legal/terms"
                className="text-inherit transition hover:opacity-70"
              >
                Privacy Policy
              </Link>
            </p>
            <p className="sm:justify-self-end sm:text-right">© 2024 Agora</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
