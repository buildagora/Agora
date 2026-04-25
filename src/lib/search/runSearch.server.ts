/**
 * Supplier search orchestrator.
 *
 * Approach: classify the user's query into a supplier category via a fast
 * Gemini call (no grounding), then filter DB suppliers by that category +
 * distance from the user. No per-supplier Google verification — that turned
 * out to be too slow (~25s) and didn't change which suppliers matched, only
 * how they were decorated.
 *
 * If classification returns null (query doesn't fit any category), we fall
 * back to showing all nearby suppliers, sorted by distance.
 *
 * Persistence shape inside `AgentThread.meta`:
 *   {
 *     "location": { label, lat, lng },         // most-recent location used
 *     "searches": { [searchId]: SearchResult } // history of searches for the thread
 *   }
 */

import "server-only";
import { randomUUID } from "node:crypto";
import { getPrisma } from "@/lib/db.server";
import { haversineMiles } from "./distance";
import { classifyQueryToCategory } from "@/lib/ai/geminiClassify.server";
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

/**
 * Persist the latest location used by a thread, so future searches and the
 * client can reload it.
 */
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

/**
 * Run a supplier search. Synchronous: returns once classification +
 * filter is done. Expected latency ~1-2s.
 */
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
  const prisma = getPrisma();

  // 1. Pull distinct categories from DB so the classifier knows the actual
  //    universe (and we don't hardcode something that drifts).
  const distinct = await prisma.supplier.findMany({
    distinct: ["category"],
    select: { category: true },
  });
  const categories = Array.from(
    new Set(distinct.map((d) => d.category.toLowerCase().trim()).filter(Boolean))
  ).sort();

  // 2. Classify (best-effort — null = no category match, fall through to all)
  let classifiedCategory: string | null = null;
  let classifyError: string | undefined;
  try {
    const result = await classifyQueryToCategory({
      query: args.query,
      categories,
    });
    classifiedCategory = result.category;
  } catch (err: any) {
    classifyError = err?.message ?? "Classification failed";
  }

  // 3. Pull candidates: by category if classified, else all suppliers with coords
  const all = await prisma.supplier.findMany({
    where: { latitude: { not: null }, longitude: { not: null } },
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

  const filtered = classifiedCategory
    ? all.filter((s) => s.category.toLowerCase().trim() === classifiedCategory)
    : all;

  // 4. Distance filter + sort + cap
  const cards: SupplierCard[] = filtered
    .map((s) => ({
      supplier: s,
      distanceMiles: haversineMiles(
        { lat: args.location.lat, lng: args.location.lng },
        { lat: s.latitude!, lng: s.longitude! }
      ),
    }))
    .filter((x) => x.distanceMiles <= radiusMiles)
    .sort((a, b) => a.distanceMiles - b.distanceMiles)
    .slice(0, maxResults)
    .map((x) => ({
      supplierId: x.supplier.id,
      name: x.supplier.name,
      category: x.supplier.category,
      street: x.supplier.street,
      city: x.supplier.city,
      state: x.supplier.state,
      phone: x.supplier.phone,
      distanceMiles: Math.round(x.distanceMiles * 10) / 10,
    }));

  const result: SearchResult = {
    searchId,
    threadId: args.threadId,
    query: args.query,
    category: classifiedCategory,
    location: args.location,
    radiusMiles,
    status: classifyError ? "error" : "complete",
    cards,
    error: classifyError,
    createdAt,
  };
  await persistSearch({ threadId: args.threadId, search: result });
  return result;
}
