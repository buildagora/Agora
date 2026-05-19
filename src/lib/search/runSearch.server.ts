/**
 * Supplier search orchestrator.
 *
 * Pipeline:
 *   chat (Gemini) refines the user's intent into a specific query
 *      → user taps "See suppliers"
 *      → THIS runs: capability lookup (main's searchCapabilities) → group
 *        per supplier → distance filter → ranked SupplierCards
 *
 * No more Gemini classification in the search path. The capability table
 * (SupplierCapability) is the curated source of truth for "what does this
 * supplier carry" — much more accurate than inferring a category from prose,
 * and roughly free at runtime.
 *
 * Per-supplier site search (the slow `searchSupplierSite` adapter that hits
 * supplier websites via SerpAPI) is deliberately NOT called here — it's
 * 5-15s per supplier and would balloon latency. A follow-up step can enrich
 * the top-N cards with live product pages.
 *
 * Persistence shape inside `AgentThread.meta`:
 *   {
 *     "location": { label, lat, lng },
 *     "searches": { [searchId]: SearchResult }
 *   }
 */

import "server-only";
import { randomUUID } from "node:crypto";
import { getPrisma } from "@/lib/db.server";
import { haversineMiles } from "./distance";
import {
  searchCapabilities,
  type CapabilitySearchResult,
} from "./capabilitySearch";
import type { SearchResult, SupplierCard } from "./types";

const RADIUS_MILES = 25;
const MAX_RESULTS = 25;

type ThreadMeta = {
  location?: { label: string; lat: number; lng: number };
  searches?: Record<string, SearchResult>;
};

function parseMeta(raw: string | null): ThreadMeta {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as ThreadMeta) : {};
  } catch {
    return {};
  }
}

export async function persistThreadLocation(args: {
  threadId: string;
  location: { label: string; lat: number; lng: number };
}): Promise<void> {
  const prisma = getPrisma();
  const row = await prisma.agentThread.findUnique({
    where: { id: args.threadId },
    select: { meta: true },
  });
  if (!row) return;
  const meta = parseMeta(row.meta);
  meta.location = args.location;
  await prisma.agentThread.update({
    where: { id: args.threadId },
    data: { meta: JSON.stringify(meta) },
  });
}

export async function loadSearch(args: {
  threadId: string;
  searchId: string;
}): Promise<SearchResult | null> {
  const prisma = getPrisma();
  const row = await prisma.agentThread.findUnique({
    where: { id: args.threadId },
    select: { meta: true },
  });
  if (!row) return null;
  const meta = parseMeta(row.meta);
  return meta.searches?.[args.searchId] ?? null;
}

async function persistSearch(args: {
  threadId: string;
  search: SearchResult;
}): Promise<void> {
  const prisma = getPrisma();
  const row = await prisma.agentThread.findUnique({
    where: { id: args.threadId },
    select: { meta: true },
  });
  if (!row) throw new Error("thread not found");
  const meta = parseMeta(row.meta);
  meta.searches = { ...(meta.searches || {}), [args.search.searchId]: args.search };
  await prisma.agentThread.update({
    where: { id: args.threadId },
    data: { meta: JSON.stringify(meta) },
  });
}

/** Per-supplier aggregation of capability hits. */
type SupplierAggregate = {
  best: CapabilitySearchResult;
  brands: Set<string>;
  productLines: Set<string>;
};

function aggregateBySupplier(
  matches: CapabilitySearchResult[]
): Map<string, SupplierAggregate> {
  const out = new Map<string, SupplierAggregate>();
  for (const m of matches) {
    const existing = out.get(m.supplierId);
    if (!existing) {
      out.set(m.supplierId, {
        best: m,
        brands: new Set(m.brand ? [m.brand] : []),
        productLines: new Set(m.productLine ? [m.productLine] : []),
      });
      continue;
    }
    if (m.score > existing.best.score) existing.best = m;
    if (m.brand) existing.brands.add(m.brand);
    if (m.productLine) existing.productLines.add(m.productLine);
  }
  return out;
}

function buildMatchNote(agg: SupplierAggregate): string | undefined {
  const productLines = Array.from(agg.productLines);
  const brands = Array.from(agg.brands);
  if (productLines.length > 0) {
    const head = productLines[0];
    const extra = productLines.length - 1;
    return extra > 0
      ? `Carries ${head} +${extra} more product line${extra === 1 ? "" : "s"}`
      : `Carries ${head}`;
  }
  if (brands.length > 0) {
    const head = brands[0];
    const extra = brands.length - 1;
    return extra > 0
      ? `Carries ${head} +${extra} more brand${extra === 1 ? "" : "s"}`
      : `Carries ${head}`;
  }
  return undefined;
}

export async function runSearch(args: {
  threadId: string;
  query: string;
  location: { label: string; lat: number; lng: number };
  radiusMiles?: number;
  maxResults?: number;
}): Promise<SearchResult> {
  const radiusMiles = args.radiusMiles ?? RADIUS_MILES;
  const maxResults = args.maxResults ?? MAX_RESULTS;
  const searchId = randomUUID();
  const createdAt = new Date().toISOString();

  // 1. Capability lookup against curated SupplierCapability table
  const matches = await searchCapabilities(args.query);
  const bySupplier = aggregateBySupplier(matches);

  if (bySupplier.size === 0) {
    const empty: SearchResult = {
      searchId,
      threadId: args.threadId,
      query: args.query,
      category: null,
      location: args.location,
      radiusMiles,
      status: "complete",
      cards: [],
      createdAt,
    };
    await persistSearch({ threadId: args.threadId, search: empty });
    return empty;
  }

  // 2. Load full supplier records (need coords for distance, contact for cards)
  const prisma = getPrisma();
  const supplierIds = Array.from(bySupplier.keys());
  const suppliers = await prisma.supplier.findMany({
    where: {
      id: { in: supplierIds },
      latitude: { not: null },
      longitude: { not: null },
    },
    select: {
      id: true,
      name: true,
      category: true,
      street: true,
      city: true,
      state: true,
      latitude: true,
      longitude: true,
      phone: true,
    },
  });

  // 3. Distance filter + assemble cards with score for sorting
  type Scored = SupplierCard & { _score: number };
  const scoredCards: Scored[] = [];
  for (const s of suppliers) {
    const distance = haversineMiles(
      { lat: args.location.lat, lng: args.location.lng },
      { lat: s.latitude!, lng: s.longitude! }
    );
    if (distance > radiusMiles) continue;
    const agg = bySupplier.get(s.id)!;
    scoredCards.push({
      supplierId: s.id,
      name: s.name,
      category: s.category,
      street: s.street,
      city: s.city,
      state: s.state,
      phone: s.phone,
      distanceMiles: Math.round(distance * 10) / 10,
      note: buildMatchNote(agg),
      sourceUrl: agg.best.sourceUrl || undefined,
      _score: agg.best.score,
    });
  }

  // 4. Sort by capability score DESC, then distance ASC; cap to maxResults.
  scoredCards.sort((a, b) => {
    if (b._score !== a._score) return b._score - a._score;
    return a.distanceMiles - b.distanceMiles;
  });
  const cards: SupplierCard[] = scoredCards
    .slice(0, maxResults)
    .map(({ _score, ...rest }) => rest);

  const result: SearchResult = {
    searchId,
    threadId: args.threadId,
    query: args.query,
    category: null,
    location: args.location,
    radiusMiles,
    status: "complete",
    cards,
    createdAt,
  };
  await persistSearch({ threadId: args.threadId, search: result });
  return result;
}
