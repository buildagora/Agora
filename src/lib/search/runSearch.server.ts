/**
 * Supplier search orchestrator.
 *
 * Pipeline:
 *   chat (Gemini) refines the user's intent into a specific query
 *      → user taps "See suppliers"
 *      → executeSupplierSearch: capability lookup → gate → ranked SupplierCards
 *
 * Per-supplier site search (SerpAPI) is NOT called here — only optional prewarm
 * on the top-N cards after results return.
 */

import "server-only";
import { randomUUID } from "node:crypto";
import { getPrisma } from "@/lib/db.server";
import { findSupplierSearchAdapter } from "@/lib/suppliers/registry";
import { logAdapterBypassObservation } from "@/lib/suppliers/routing/extractionTelemetry";
import { isApiPrewarmOrchestratorFirst } from "@/lib/suppliers/routing/promotedOrchestratorRouting";
import { toProductSearchQuery } from "./productSearchQuery";
import {
  executeSupplierSearch,
  DEFAULT_SEARCH_MAX_RESULTS,
  DEFAULT_SEARCH_RADIUS_MILES,
} from "./executeSupplierSearch";
import type { SearchResult, SupplierCard } from "./types";

const PREWARM_TOP_N = 3;

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

async function prewarmSupplierSearchCache(
  cards: SupplierCard[],
  query: string
): Promise<void> {
  if (cards.length === 0 || !query.trim()) return;

  const productSearchQuery = toProductSearchQuery(query);

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
        const orchestratorFirst = isApiPrewarmOrchestratorFirst(
          card.supplierId
        );
        if (adapter && !orchestratorFirst) {
          logAdapterBypassObservation({
            supplierId: card.supplierId,
            entryPoint: "prewarm",
            query: productSearchQuery,
            strategyUsed: adapter.apiSource,
          });
          await adapter.search(productSearchQuery);
          return;
        }
        const domain = supplierDomains.get(card.supplierId);
        const { searchSupplierDiscoveryForSupplier } = await import(
          "@/lib/suppliers/resolveSupplierDiscovery"
        );
        await searchSupplierDiscoveryForSupplier(
          card.supplierId,
          productSearchQuery,
          domain,
          { entryPoint: "prewarm" }
        );
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

export async function runSearch(args: {
  threadId: string;
  query: string;
  location: { label: string; lat: number; lng: number };
  radiusMiles?: number;
  maxResults?: number;
}): Promise<SearchResult> {
  const radiusMiles = args.radiusMiles ?? DEFAULT_SEARCH_RADIUS_MILES;
  const maxResults = args.maxResults ?? DEFAULT_SEARCH_MAX_RESULTS;
  const searchId = randomUUID();
  const createdAt = new Date().toISOString();

  const pipeline = await executeSupplierSearch({
    query: args.query,
    location: args.location,
    radiusMiles,
    maxResults,
  });

  prewarmSupplierSearchCache(
    pipeline.cards.slice(0, PREWARM_TOP_N),
    args.query
  ).catch(() => {
    /* swallow — pre-warm failure just means a cache miss on click */
  });

  const result: SearchResult = {
    searchId,
    threadId: args.threadId,
    query: args.query,
    category: pipeline.inferredCategory,
    location: args.location,
    radiusMiles,
    status: "complete",
    cards: pipeline.cards,
    createdAt,
  };
  await persistSearch({ threadId: args.threadId, search: result });
  return result;
}
