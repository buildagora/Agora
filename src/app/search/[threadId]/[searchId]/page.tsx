/**
 * /search/[threadId]/[searchId]
 *
 * Server-rendered supplier search results.
 *
 * The search is run synchronously by POST /api/search before navigation, so
 * by the time we render here the data is already in AgentThread.meta. We
 * load it, ownership-check via cookie/user, and render cards.
 */

import { cookies, headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import SiteFooter from "@/components/layout/SiteFooter";
import SiteHeader from "@/components/layout/SiteHeader";
import SupplierCard from "@/components/SupplierCard";
import { getCurrentUserFromRequest } from "@/lib/auth/server";
import { ANON_COOKIE_NAME } from "@/lib/chat/types";
import { loadThread } from "@/lib/chat/threads.server";
import { loadSearch } from "@/lib/search/runSearch.server";
import type { SearchResult } from "@/lib/search/types";

export const dynamic = "force-dynamic";

async function loadOwnedSearch(args: {
  threadId: string;
  searchId: string;
}): Promise<SearchResult | null> {
  // Reconstruct a minimal Request so we can reuse the existing auth helper.
  const cookieStore = await cookies();
  const cookieHeader = cookieStore
    .getAll()
    .map((c) => `${c.name}=${encodeURIComponent(c.value)}`)
    .join("; ");
  const reqHeaders = new Headers(await headers());
  if (cookieHeader) reqHeaders.set("cookie", cookieHeader);
  const fakeReq = new Request("http://internal/", { headers: reqHeaders });

  const user = await getCurrentUserFromRequest(fakeReq);
  const anonymousId = user
    ? null
    : cookieStore.get(ANON_COOKIE_NAME)?.value ?? null;
  if (!user && !anonymousId) return null;

  const owner = user ? { userId: user.id } : { anonymousId: anonymousId! };
  const thread = await loadThread(args.threadId, owner);
  if (!thread) return null;

  return loadSearch({ threadId: args.threadId, searchId: args.searchId });
}

export default async function SearchResultsPage({
  params,
}: {
  params: Promise<{ threadId: string; searchId: string }>;
}) {
  const { threadId, searchId } = await params;
  const search = await loadOwnedSearch({ threadId, searchId });
  if (!search) notFound();

  const count = search.cards.length;
  const categoryLabel = search.category ? formatCategory(search.category) : null;
  const subtitle = categoryLabel
    ? `${count} ${categoryLabel.toLowerCase()} ${count === 1 ? "supplier" : "suppliers"} within ${search.radiusMiles} miles of ${search.location.label}`
    : `${count} ${count === 1 ? "supplier" : "suppliers"} within ${search.radiusMiles} miles of ${search.location.label}`;

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <SiteHeader />

      <main className="flex-1 px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
        <div className="mx-auto w-full max-w-3xl">
          <div className="mb-6 flex items-start justify-between gap-4">
            <div>
              <h1 className="text-[22px] font-normal leading-snug text-zinc-900 sm:text-[26px]">
                Suppliers for &ldquo;{search.query}&rdquo;
              </h1>
              <p className="mt-1 text-sm text-zinc-500">
                {count > 0
                  ? subtitle
                  : `No suppliers found within ${search.radiusMiles} miles of ${search.location.label}`}
              </p>
            </div>
            <Link
              href="/"
              className="shrink-0 rounded-full border border-zinc-200 px-3 py-1.5 text-xs text-zinc-600 transition hover:bg-zinc-50 hover:text-zinc-900 sm:text-[13px]"
            >
              ← New search
            </Link>
          </div>

          {search.status === "error" && (
            <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {search.error || "Search ran into an error."}
            </div>
          )}

          {search.cards.length === 0 ? (
            <EmptyResults radiusMiles={search.radiusMiles} />
          ) : (
            <ul className="grid grid-cols-1 gap-3">
              {search.cards.map((c) => (
                <li key={c.supplierId}>
                  <SupplierCard card={c} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}

function formatCategory(raw: string): string {
  if (!raw) return "";
  return raw
    .toLowerCase()
    .split("_")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" & ");
}

function EmptyResults({ radiusMiles }: { radiusMiles: number }) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-6 py-10 text-center">
      <p className="text-sm text-zinc-700">
        No suppliers found within {radiusMiles} miles.
      </p>
      <p className="mt-2 text-xs text-zinc-500">
        Try a different location, or expand your search radius.
      </p>
    </div>
  );
}
