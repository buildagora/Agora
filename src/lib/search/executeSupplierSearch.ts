/**
 * Core supplier search pipeline (capability lookup, category gate, ranking).
 * Shared by runSearch and offline audit scripts. Does not persist or call SerpAPI.
 */

import { getPrisma } from "@/lib/db.server";
import {
  classifyQueryToCategory,
  type KnownCategoryId,
} from "@/lib/ai/classifyQuery";
import {
  normalizeToCanonicalCategoryId,
  pickPrimaryCategoryId,
} from "@/lib/suppliers/categoryTaxonomy";
import type { CategoryId } from "@/lib/categoryIds";
import { haversineMiles } from "./distance";
import {
  searchCapabilities,
  type CapabilitySearchResult,
} from "./capabilitySearch";
import { toProductSearchQuery } from "./productSearchQuery";
import type { SupplierCard } from "./types";
import {
  buildCategoryIdBySupplier,
  logGeoExcludedCapabilityMatches,
} from "./geoExclusionTelemetry";
import {
  attachLiveEvidenceToCard,
  computeBaseRankScore,
  LIVE_EVIDENCE_CANDIDATE_N,
  rankSupplierCards,
  runStage2LiveEvidence,
  type SupplierLiveEvidenceRecord,
} from "./liveEvidence";
import { isFingerprintRouterEnabled } from "@/lib/suppliers/routing/routerFlags";

export const DEFAULT_SEARCH_RADIUS_MILES = 25;
export const DEFAULT_SEARCH_MAX_RESULTS = 25;

const BROAD_CATALOG_PREFIXES = ["home_depot", "lowes"] as const;
type BroadCatalogPrefix = (typeof BROAD_CATALOG_PREFIXES)[number];

const BROAD_CATALOG_LABEL: Record<BroadCatalogPrefix, string> = {
  home_depot: "Home Depot",
  lowes: "Lowe's",
};

const supplierCategorySelect = {
  id: true,
  category: true,
  primaryCategoryId: true,
  categoryLinks: { select: { categoryId: true } },
} as const;

type SupplierRow = {
  id: string;
  category: string | null;
  primaryCategoryId: string | null;
  categoryLinks: { categoryId: string }[];
  name: string;
  street: string;
  city: string;
  state: string;
  latitude: number | null;
  longitude: number | null;
  phone: string | null;
  logoUrl: string | null;
};

export function resolveSupplierPrimaryCategoryId(
  supplier: SupplierRow
): CategoryId {
  const persisted = normalizeToCanonicalCategoryId(
    supplier.primaryCategoryId ?? null
  );
  if (persisted) return persisted;

  return pickPrimaryCategoryId({
    supplierId: supplier.id,
    linkCategoryIds: supplier.categoryLinks.map((l) => l.categoryId),
    legacyCategory: supplier.category ?? null,
  });
}

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

function capabilityMatchesInferredCategory(
  match: CapabilitySearchResult,
  inferredCategory: KnownCategoryId
): boolean {
  const matchCat =
    normalizeToCanonicalCategoryId(match.categoryId) ??
    match.categoryId.toLowerCase();
  return matchCat === inferredCategory;
}

function scoreToConfidence(score: number): "high" | "medium" | "low" {
  if (score >= 30) return "high";
  if (score >= 15) return "medium";
  return "low";
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

export function describeCapabilityMatch(best: CapabilitySearchResult): string {
  const parts: string[] = [];
  if (best.productLine) parts.push(`product line "${best.productLine}"`);
  if (best.brand) parts.push(`brand "${best.brand}"`);
  if (best.subcategory) parts.push(`subcategory "${best.subcategory}"`);
  const detail = parts.length > 0 ? parts.join("; ") : `category ${best.categoryId}`;
  return `Capability match (${detail}); score ${best.score}`;
}

export type SupplierSearchMatchDetail = {
  supplierId: string;
  name: string;
  categoryId: string;
  distanceMiles: number;
  capabilityScore: number | null;
  confidence: "high" | "medium" | "low" | null;
  kind: "capability" | "live-catalog";
  matchReason: string;
  suspicious: boolean;
  suspiciousReason?: string;
};

export type ExecuteSupplierSearchResult = {
  query: string;
  productSearchQuery: string;
  inferredCategory: KnownCategoryId | null;
  radiusMiles: number;
  useCategoryFallback: boolean;
  rawMatchCount: number;
  gatedMatchCount: number;
  cards: SupplierCard[];
  suppliers: SupplierSearchMatchDetail[];
};

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
      ...supplierCategorySelect,
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

  const bestByPrefix = new Map<
    BroadCatalogPrefix,
    { card: SupplierCard; distance: number }
  >();
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

async function loadCategoryAlignedSupplierCards(args: {
  inferredCategory: KnownCategoryId;
  location: { label: string; lat: number; lng: number };
  radiusMiles: number;
  excludeIds: Set<string>;
}): Promise<SupplierCard[]> {
  const prisma = getPrisma();
  const suppliers = await prisma.supplier.findMany({
    where: {
      latitude: { not: null },
      longitude: { not: null },
      OR: [
        { primaryCategoryId: args.inferredCategory },
        {
          categoryLinks: {
            some: { categoryId: args.inferredCategory },
          },
        },
      ],
    },
    select: {
      ...supplierCategorySelect,
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

  const cards: SupplierCard[] = [];
  for (const s of suppliers) {
    if (args.excludeIds.has(s.id)) continue;
    const distance = haversineMiles(
      { lat: args.location.lat, lng: args.location.lng },
      { lat: s.latitude!, lng: s.longitude! }
    );
    if (distance > args.radiusMiles) continue;
    cards.push({
      supplierId: s.id,
      name: s.name,
      categoryId: resolveSupplierPrimaryCategoryId(s),
      street: s.street,
      city: s.city,
      state: s.state,
      phone: s.phone,
      distanceMiles: Math.round(distance * 10) / 10,
      note: `Listed in ${args.inferredCategory.replace(/_/g, " ")} — browse catalog for your product.`,
      logoUrl: s.logoUrl ?? null,
      kind: "capability",
      confidence: "low",
    });
  }
  return cards;
}

export type ExecuteSupplierSearchDeps = {
  classifyQueryToCategoryFn?: typeof classifyQueryToCategory;
  searchCapabilitiesFn?: typeof searchCapabilities;
  runStage2LiveEvidenceFn?: typeof runStage2LiveEvidence;
  logGeoExcludedFn?: typeof logGeoExcludedCapabilityMatches;
  skipGeoTelemetry?: boolean;
  skipLiveEvidence?: boolean;
};

export type ExecuteSupplierSearchArgs = {
  query: string;
  location: { label: string; lat: number; lng: number };
  radiusMiles?: number;
  maxResults?: number;
  /** When set, skips Gemini and uses this category (audit fixtures). */
  inferredCategoryOverride?: KnownCategoryId | null;
  deps?: ExecuteSupplierSearchDeps;
};

/**
 * Production supplier search pipeline without persistence or SerpAPI prewarm.
 */
export async function executeSupplierSearch(
  args: ExecuteSupplierSearchArgs
): Promise<ExecuteSupplierSearchResult> {
  const radiusMiles = args.radiusMiles ?? DEFAULT_SEARCH_RADIUS_MILES;
  const maxResults = args.maxResults ?? DEFAULT_SEARCH_MAX_RESULTS;
  const deps = args.deps ?? {};
  const classifyFn = deps.classifyQueryToCategoryFn ?? classifyQueryToCategory;
  const searchCapabilitiesFn = deps.searchCapabilitiesFn ?? searchCapabilities;
  const runStage2Fn = deps.runStage2LiveEvidenceFn ?? runStage2LiveEvidence;
  const logGeoExcluded = deps.logGeoExcludedFn ?? logGeoExcludedCapabilityMatches;

  const inferredCategory =
    args.inferredCategoryOverride !== undefined
      ? args.inferredCategoryOverride
      : await classifyFn(args.query);

  const productSearchQuery =
    toProductSearchQuery(args.query) || args.query.trim();

  const rawMatches = await searchCapabilitiesFn(productSearchQuery, {
    originalQuery: args.query,
  });

  let matches: CapabilitySearchResult[];
  let useCategoryFallback = false;

  if (inferredCategory) {
    const gated = rawMatches.filter((m) =>
      capabilityMatchesInferredCategory(m, inferredCategory)
    );
    if (gated.length > 0) {
      matches = gated;
    } else {
      matches = [];
      useCategoryFallback = true;
    }
  } else {
    matches = rawMatches;
  }

  const gatedMatchCount = inferredCategory
    ? rawMatches.filter((m) =>
        capabilityMatchesInferredCategory(m, inferredCategory)
      ).length
    : rawMatches.length;

  const bySupplier = aggregateBySupplier(matches);
  const capabilityScoreBySupplier = new Map<string, number>();
  const matchReasonBySupplier = new Map<string, string>();

  for (const [supplierId, agg] of bySupplier) {
    capabilityScoreBySupplier.set(supplierId, agg.best.score);
    matchReasonBySupplier.set(
      supplierId,
      describeCapabilityMatch(agg.best)
    );
  }

  let capabilityCards: SupplierCard[] = [];
  const domainBySupplier = new Map<string, string | null>();

  if (bySupplier.size > 0) {
    const prisma = getPrisma();
    const supplierIds = Array.from(bySupplier.keys());

    if (!deps.skipGeoTelemetry) {
      await logGeoExcluded({
        query: args.query,
        supplierIds,
        capabilityScoreBySupplier,
        categoryIdBySupplier: buildCategoryIdBySupplier(matches),
      });
    }

    const suppliers = await prisma.supplier.findMany({
      where: {
        id: { in: supplierIds },
        latitude: { not: null },
        longitude: { not: null },
      },
      select: {
        ...supplierCategorySelect,
        name: true,
        street: true,
        city: true,
        state: true,
        latitude: true,
        longitude: true,
        phone: true,
        logoUrl: true,
        domain: true,
      },
    });

    for (const s of suppliers) {
      domainBySupplier.set(s.id, s.domain);
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
  } else if (inferredCategory && useCategoryFallback) {
    capabilityCards = await loadCategoryAlignedSupplierCards({
      inferredCategory,
      location: args.location,
      radiusMiles,
      excludeIds: new Set(),
    });
    for (const card of capabilityCards) {
      matchReasonBySupplier.set(
        card.supplierId,
        `Category listing (${inferredCategory.replace(/_/g, " ")}) — no product capability row matched`
      );
      capabilityScoreBySupplier.set(card.supplierId, 0);
    }
  }

  const includedIds = new Set(capabilityCards.map((c) => c.supplierId));
  const liveCards = await loadClosestBigBoxCards({
    location: args.location,
    radiusMiles,
    excludeIds: includedIds,
  });

  for (const card of liveCards) {
    const prefix = BROAD_CATALOG_PREFIXES.find((p) =>
      card.supplierId.startsWith(p)
    );
    matchReasonBySupplier.set(
      card.supplierId,
      `Live catalog (${prefix ? BROAD_CATALOG_LABEL[prefix] : "big-box"}) — broad retailer search at click time`
    );
    capabilityScoreBySupplier.set(card.supplierId, 0);
  }

  const rankArgs = {
    inferredCategory,
    capabilityScoreBySupplier,
  };
  const allCards = [...capabilityCards, ...liveCards];
  const baseRanked = rankSupplierCards(allCards, rankArgs);

  const rankBeforeBySupplier = new Map<string, number>();
  const baseScoreBySupplier = new Map<string, number>();
  baseRanked.forEach((card, index) => {
    rankBeforeBySupplier.set(card.supplierId, index + 1);
    baseScoreBySupplier.set(
      card.supplierId,
      computeBaseRankScore(card, rankArgs)
    );
  });

  const baseRankedCapability = rankSupplierCards(capabilityCards, rankArgs);
  const candidateSupplierIds = baseRankedCapability
    .slice(0, LIVE_EVIDENCE_CANDIDATE_N)
    .map((card) => card.supplierId);

  let evidenceBySupplier = new Map<string, SupplierLiveEvidenceRecord>();
  let liveBoostBySupplier = new Map<string, number>();

  if (
    !deps.skipLiveEvidence &&
    isFingerprintRouterEnabled() &&
    candidateSupplierIds.length > 0
  ) {
    const stage2 = await runStage2Fn({
      query: args.query,
      productSearchQuery,
      candidateSupplierIds,
      domainBySupplier,
      rankBeforeBySupplier,
      baseScoreBySupplier,
      rankArgs,
      cardsForFinalRank: allCards,
    });
    evidenceBySupplier = stage2.evidenceBySupplier;
    liveBoostBySupplier = stage2.liveBoostBySupplier;
  }

  const cards = rankSupplierCards(allCards, {
    ...rankArgs,
    liveBoostBySupplier,
  })
    .slice(0, maxResults)
    .map((card) => {
      const evidence = evidenceBySupplier.get(card.supplierId);
      return evidence ? attachLiveEvidenceToCard(card, evidence) : card;
    });

  const suppliers: SupplierSearchMatchDetail[] = cards.map((card) => ({
    supplierId: card.supplierId,
    name: card.name,
    categoryId: card.categoryId,
    distanceMiles: card.distanceMiles,
    capabilityScore: capabilityScoreBySupplier.get(card.supplierId) ?? null,
    confidence: card.confidence ?? null,
    kind: card.kind ?? "capability",
    matchReason:
      matchReasonBySupplier.get(card.supplierId) ??
      card.note ??
      "Included in ranked results",
    suspicious: false,
  }));

  return {
    query: args.query,
    productSearchQuery,
    inferredCategory,
    radiusMiles,
    useCategoryFallback,
    rawMatchCount: rawMatches.length,
    gatedMatchCount,
    cards,
    suppliers,
  };
}
