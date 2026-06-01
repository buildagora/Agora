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
import { classifyQueryToCategory } from "@/lib/ai/classifyQuery";
import { normalizeToCanonicalCategoryId } from "@/lib/suppliers/categoryTaxonomy";
import { findSupplierSearchAdapter } from "@/lib/suppliers/registry";
import { haversineMiles } from "./distance";
import {
  searchCapabilities,
  type CapabilitySearchResult,
} from "./capabilitySearch";
import {
  resolveSupplierPrimaryCategoryId,
  supplierPrimaryCategorySelect,
} from "@/lib/suppliers/primaryCategory.server";
import type { SearchResult, SupplierCard } from "./types";

/**
 * Top-N nearest cards to pre-warm SerpAPI cache for. Higher = more chance the
 * user's first click is instant; also more SerpAPI cost per chat search even
 * if the user never clicks. 3 is conservative.
 */
const PREWARM_TOP_N = 3;

const RADIUS_MILES = 25;
const MAX_RESULTS = 25;

/**
 * Broad-catalog retailers — capabilities are too vast to model in
 * SupplierCapability. We surface them as "live-search" cards: the supplier
 * detail page calls their adapter at click time (Google Shopping for these
 * two), so we don't need any DB capability data to include them.
 */
const BROAD_CATALOG_PREFIXES = ["home_depot", "lowes"] as const;
type BroadCatalogPrefix = (typeof BROAD_CATALOG_PREFIXES)[number];

const BROAD_CATALOG_LABEL: Record<BroadCatalogPrefix, string> = {
  home_depot: "Home Depot",
  lowes: "Lowe's",
};

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

/**
 * Run each card's per-supplier search in parallel against SerpAPI to warm
 * the disk cache (src/lib/serpCache/server.ts). Each call goes through the
 * same code path the supplier detail page will use, so the URLs — and
 * therefore the cache keys — match exactly.
 *
 * Errors per supplier are swallowed independently so one bad supplier
 * doesn't block the others' pre-warm.
 */
async function prewarmSupplierSearchCache(
  cards: SupplierCard[],
  query: string
): Promise<void> {
  if (cards.length === 0 || !query.trim()) return;

  // Need supplier domains for any non-adapter card. One query covers all.
  const prisma = getPrisma();
  const supplierDomains = new Map<string, string | null>();
  const supplierRows = await prisma.supplier.findMany({
    where: { id: { in: cards.map((c) => c.supplierId) } },
    select: { id: true, domain: true, name: true },
  });
  const supplierNames = new Map<string, string>();
  for (const s of supplierRows) {
    supplierDomains.set(s.id, s.domain);
    supplierNames.set(s.id, s.name);
  }

  await Promise.all(
    cards.map(async (card) => {
      try {
        const adapter = findSupplierSearchAdapter(card.supplierId);
        if (adapter) {
          await adapter.search(query);
          return;
        }
        const domain = supplierDomains.get(card.supplierId);
        if (!domain) return;
        const { searchSupplierSite } = await import(
          "@/lib/suppliers/searchSupplierSite"
        );
        await searchSupplierSite({
          query,
          domain,
          supplierIds: [card.supplierId],
          source: "GENERIC",
          logLabel: supplierNames.get(card.supplierId) ?? "Supplier",
        });
      } catch (err) {
        console.warn(
          `[prewarm] ${card.supplierId} failed: ${
            err instanceof Error ? err.message : String(err)
          }`
        );
      }
    })
  );
}

/**
 * Map a capabilitySearch score to a coarse confidence tier.
 * Score buckets (from capabilitySearch.ts):
 *   - >=30: productLine match (very specific) → high
 *   - 15-29: subcategory or strong brand match → medium
 *   - <15: weak brand/term overlap → low
 */
function scoreToConfidence(score: number): "high" | "medium" | "low" {
  if (score >= 30) return "high";
  if (score >= 15) return "medium";
  return "low";
}

/**
 * Find the single closest store within radius for each broad-catalog chain,
 * skipping any supplier already in the capability-matched results.
 */
async function loadClosestBigBoxCards(args: {
  location: { label: string; lat: number; lng: number };
  radiusMiles: number;
  excludeIds: Set<string>;
}): Promise<SupplierCard[]> {
  const prisma = getPrisma();
  const candidates = await prisma.supplier.findMany({
    where: {
      OR: BROAD_CATALOG_PREFIXES.map((p) => ({ id: { startsWith: p } })),
      latitude: { not: null },
      longitude: { not: null },
    },
    select: {
      ...supplierPrimaryCategorySelect,
      name: true,
      street: true,
      city: true,
      state: true,
      latitude: true,
      longitude: true,
      phone: true,
      logoUrl: true,
    },
  });

  // Compute distance, group by prefix, keep the nearest of each (still skipping any
  // that already appear in capability-matched results).
  const bestByPrefix = new Map<BroadCatalogPrefix, { card: SupplierCard; distance: number }>();
  for (const s of candidates) {
    if (args.excludeIds.has(s.id)) continue;
    const prefix = BROAD_CATALOG_PREFIXES.find((p) => s.id.startsWith(p));
    if (!prefix) continue;
    const distance = haversineMiles(
      { lat: args.location.lat, lng: args.location.lng },
      { lat: s.latitude!, lng: s.longitude! }
    );
    if (distance > args.radiusMiles) continue;
    const current = bestByPrefix.get(prefix);
    if (current && current.distance <= distance) continue;
    bestByPrefix.set(prefix, {
      distance,
      card: {
        supplierId: s.id,
        name: s.name,
        categoryId: resolveSupplierPrimaryCategoryId(s),
        street: s.street,
        city: s.city,
        state: s.state,
        phone: s.phone,
        distanceMiles: Math.round(distance * 10) / 10,
        note: `Live catalog search — current pricing and availability from ${BROAD_CATALOG_LABEL[prefix]}.`,
        logoUrl: s.logoUrl ?? null,
        kind: "live-catalog",
      },
    });
  }

  return Array.from(bestByPrefix.values())
    .sort((a, b) => a.distance - b.distance)
    .map((x) => x.card);
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

  // 1a. Classify the query to a canonical category (cheap Gemini call, no
  // grounding). Used to gate capability matches so "Pine" doesn't match
  // landscaping Pinestraw, "Wood" doesn't match cabinet-shop Paint Grade
  // Wood, etc. Returns null if the model can't classify — in which case
  // we fall through unfiltered.
  const inferredCategory = await classifyQueryToCategory(args.query);

  // 1b. Capability lookup against curated SupplierCapability table
  const rawMatches = await searchCapabilities(args.query);

  // 1c. Gate by inferred category. If the gate would leave us with zero
  // matches, fall back to unfiltered (better to show loose matches than
  // an empty results page when the classifier guessed wrong).
  let matches: CapabilitySearchResult[];
  if (inferredCategory) {
    const gated = rawMatches.filter((m) => {
      const matchCat =
        normalizeToCanonicalCategoryId(m.categoryId) ?? m.categoryId.toLowerCase();
      return matchCat === inferredCategory;
    });
    matches = gated.length > 0 ? gated : rawMatches;
  } else {
    matches = rawMatches;
  }

  const bySupplier = aggregateBySupplier(matches);

  if (bySupplier.size === 0) {
    const empty: SearchResult = {
      searchId,
      threadId: args.threadId,
      query: args.query,
      category: inferredCategory,
      location: args.location,
      radiusMiles,
      status: "complete",
      cards: [],
      createdAt,
    };
    await persistSearch({ threadId: args.threadId, search: empty });
    return empty;
  }

  // 2. Load full supplier records (need coords for distance, logo for cards)
  const prisma = getPrisma();
  const supplierIds = Array.from(bySupplier.keys());
  const suppliers = await prisma.supplier.findMany({
    where: {
      id: { in: supplierIds },
      latitude: { not: null },
      longitude: { not: null },
    },
    select: {
      ...supplierPrimaryCategorySelect,
      name: true,
      street: true,
      city: true,
      state: true,
      latitude: true,
      longitude: true,
      phone: true,
      logoUrl: true,
    },
  });

  // 3. Distance filter + assemble capability cards with confidence
  const capabilityCards: SupplierCard[] = [];
  for (const s of suppliers) {
    const distance = haversineMiles(
      { lat: args.location.lat, lng: args.location.lng },
      { lat: s.latitude!, lng: s.longitude! }
    );
    if (distance > radiusMiles) continue;
    const agg = bySupplier.get(s.id)!;
    capabilityCards.push({
      supplierId: s.id,
      name: s.name,
      categoryId: resolveSupplierPrimaryCategoryId(s),
      street: s.street,
      city: s.city,
      state: s.state,
      phone: s.phone,
      distanceMiles: Math.round(distance * 10) / 10,
      note: buildMatchNote(agg),
      sourceUrl: agg.best.sourceUrl || undefined,
      logoUrl: s.logoUrl ?? null,
      kind: "capability",
      confidence: scoreToConfidence(agg.best.score),
    });
  }

  // 4. Append the closest big-box retailer per brand (Home Depot, Lowe's)
  // within radius — their catalogs are too broad to model in
  // SupplierCapability, but their adapter delivers real product results on
  // the supplier detail page. Cap at 1 store per chain.
  const includedIds = new Set(capabilityCards.map((c) => c.supplierId));
  const liveCards = await loadClosestBigBoxCards({
    location: args.location,
    radiusMiles,
    excludeIds: includedIds,
  });

  // 5. Interleave all cards by distance — confidence is conveyed via the
  // badge color, not the order. Cap to maxResults.
  const cards: SupplierCard[] = [...capabilityCards, ...liveCards]
    .sort((a, b) => a.distanceMiles - b.distanceMiles)
    .slice(0, maxResults);

  // 6. Pre-warm SerpAPI cache for the top N cards. The supplier detail page
  // calls the same adapter/searchSupplierSite path with the same query, so
  // by the time the buyer clicks one of these cards the cache is hot and
  // the detail page renders in ~0.1s instead of 5-15s. Fire-and-forget so
  // the chat search response isn't delayed.
  prewarmSupplierSearchCache(cards.slice(0, PREWARM_TOP_N), args.query).catch(
    () => {
      /* swallow — pre-warm failure just means a cache miss on click */
    }
  );

  const result: SearchResult = {
    searchId,
    threadId: args.threadId,
    query: args.query,
    category: inferredCategory,
    location: args.location,
    radiusMiles,
    status: "complete",
    cards,
    createdAt,
  };
  await persistSearch({ threadId: args.threadId, search: result });
  return result;
}
