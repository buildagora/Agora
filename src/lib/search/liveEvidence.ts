import type { ExtractionStrategy } from "@prisma/client";
import type { KnownCategoryId } from "@/lib/ai/classifyQuery";
import { loadSupplierFingerprintFacts } from "@/lib/suppliers/fingerprint/loadSupplierFingerprintFacts.server";
import { searchSupplierDiscoveryForSupplier } from "@/lib/suppliers/resolveSupplierDiscovery";
import {
  isFingerprintRouterEnabled,
  isSupplierAllowlisted,
} from "@/lib/suppliers/routing/routerFlags";
import type { SupplierExtractionRouteEvent } from "@/lib/suppliers/routing/routerTelemetry";
import { getDomainPlatformConfig } from "@/lib/suppliers/supplierDomainPlatformConfig";
import { resolvePlatformCatalogExecution } from "@/lib/suppliers/routing/resolvePlatformCatalogExecution";
import type { SupplierProductResult } from "@/lib/suppliers/types";
import { logSupplierSearchLiveEvidence } from "./searchCardTelemetry";
import type { SupplierCard } from "./types";

/** Top capability-ranked candidates probed with router live extraction (Phase 7A). */
export const LIVE_EVIDENCE_CANDIDATE_N = 10;

export type SupplierLiveEvidenceRecord = {
  liveEvidence: boolean;
  liveResultCount: number;
  liveFinalStrategyUsed?: ExtractionStrategy;
  liveFallbackDepth?: number;
  liveChainExhausted?: boolean;
  liveLatencyMs?: number;
  liveResultKindSummary?: string;
  liveTopProductTitle?: string;
  liveTopProductUrl?: string;
  liveTopProductImageUrl?: string;
  liveBoost: number;
  skippedReason?: string;
};

export type RankSupplierCardsArgs = {
  inferredCategory: KnownCategoryId | null;
  capabilityScoreBySupplier: Map<string, number>;
  liveBoostBySupplier?: Map<string, number>;
};

export function computeBaseRankScore(
  card: SupplierCard,
  args: RankSupplierCardsArgs
): number {
  let score = 0;
  if (args.inferredCategory && card.categoryId === args.inferredCategory) {
    score += 10_000;
  }
  const capScore = args.capabilityScoreBySupplier.get(card.supplierId) ?? 0;
  score += capScore * 10;
  if (card.kind === "live-catalog") {
    score += 2_500;
  }
  score -= card.distanceMiles * 5;
  score += args.liveBoostBySupplier?.get(card.supplierId) ?? 0;
  return score;
}

/** Live-product ranking boost — PROFILE never receives live-product boost. */
export function computeLiveBoost(
  liveResultCount: number,
  finalStrategyUsed?: ExtractionStrategy
): number {
  if (liveResultCount <= 0 || !finalStrategyUsed) return 0;

  switch (finalStrategyUsed) {
    case "PUBLIC_API":
    case "PLATFORM_API":
      return 1_000;
    case "SCHEMA_OR_SITEMAP":
      return 600;
    case "HTML_SCRAPE":
      return 400;
    case "SERP_PRODUCT_ENGINE":
    case "SERP_SITE_ORGANIC":
      return 300;
    case "PROBABILISTIC_CATEGORY_PROFILE":
      return 0;
    default:
      return 0;
  }
}

export function resolveLiveEvidenceSkippedReason(input: {
  supplierId: string;
  domain: string | null | undefined;
  hasFingerprint: boolean;
}): string | null {
  if (!isFingerprintRouterEnabled()) return "router_disabled";
  if (!isSupplierAllowlisted(input.supplierId)) return "not_allowlisted";
  if (!input.hasFingerprint) return "no_fingerprint";
  const domain = input.domain?.trim() ?? "";
  const hasDomainPlatform = Boolean(domain && getDomainPlatformConfig(domain));
  const hasRegistryPlatform = Boolean(
    resolvePlatformCatalogExecution(input.supplierId, domain || null)
  );
  if (!domain && !hasDomainPlatform && !hasRegistryPlatform) {
    return "no_domain_or_platform";
  }
  return null;
}

export function summarizeLiveResultKinds(
  results: SupplierProductResult[]
): string {
  if (results.length === 0) return "none";
  const counts = new Map<string, number>();
  for (const row of results) {
    const kind = row.classification ?? "product";
    counts.set(kind, (counts.get(kind) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([kind, count]) => `${kind}:${count}`)
    .join(",");
}

export function pickTopLiveResult(
  results: SupplierProductResult[]
): Pick<
  SupplierLiveEvidenceRecord,
  "liveTopProductTitle" | "liveTopProductUrl" | "liveTopProductImageUrl"
> {
  const top = results[0];
  if (!top) {
    return {};
  }
  return {
    liveTopProductTitle: top.title || undefined,
    liveTopProductUrl: top.productUrl ?? undefined,
    liveTopProductImageUrl: top.imageUrl ?? undefined,
  };
}

export function attachLiveEvidenceToCard(
  card: SupplierCard,
  evidence: SupplierLiveEvidenceRecord
): SupplierCard {
  return {
    ...card,
    liveEvidence: evidence.liveEvidence,
    liveResultCount: evidence.liveResultCount,
    liveFinalStrategyUsed: evidence.liveFinalStrategyUsed,
    liveTopProductTitle: evidence.liveTopProductTitle,
    liveTopProductUrl: evidence.liveTopProductUrl,
    liveTopProductImageUrl: evidence.liveTopProductImageUrl,
  };
}

export function rankSupplierCards(
  cards: SupplierCard[],
  args: RankSupplierCardsArgs
): SupplierCard[] {
  return [...cards].sort(
    (a, b) => computeBaseRankScore(b, args) - computeBaseRankScore(a, args)
  );
}

function createRouteEventCapture(): {
  events: SupplierExtractionRouteEvent[];
  restore: () => void;
} {
  const events: SupplierExtractionRouteEvent[] = [];
  const originalInfo = console.info.bind(console);
  console.info = (...logArgs: unknown[]) => {
    for (const arg of logArgs) {
      if (typeof arg === "string" && arg.includes("supplier_extraction_route")) {
        try {
          events.push(JSON.parse(arg) as SupplierExtractionRouteEvent);
        } catch {
          /* ignore */
        }
      }
    }
    originalInfo(...logArgs);
  };
  return {
    events,
    restore: () => {
      console.info = originalInfo;
    },
  };
}

export type RunStage2LiveEvidenceArgs = {
  query: string;
  productSearchQuery: string;
  candidateSupplierIds: string[];
  domainBySupplier: Map<string, string | null>;
  rankBeforeBySupplier: Map<string, number>;
  baseScoreBySupplier: Map<string, number>;
  rankArgs: RankSupplierCardsArgs;
  cardsForFinalRank: SupplierCard[];
  fetchDiscovery?: typeof searchSupplierDiscoveryForSupplier;
  loadFacts?: typeof loadSupplierFingerprintFacts;
};

export async function runStage2LiveEvidence(
  args: RunStage2LiveEvidenceArgs
): Promise<{
  evidenceBySupplier: Map<string, SupplierLiveEvidenceRecord>;
  liveBoostBySupplier: Map<string, number>;
  rankAfterBySupplier: Map<string, number>;
}> {
  const evidenceBySupplier = new Map<string, SupplierLiveEvidenceRecord>();
  const liveBoostBySupplier = new Map<string, number>();

  if (!isFingerprintRouterEnabled() || args.candidateSupplierIds.length === 0) {
    return {
      evidenceBySupplier,
      liveBoostBySupplier,
      rankAfterBySupplier: new Map(),
    };
  }

  const loadFacts = args.loadFacts ?? loadSupplierFingerprintFacts;
  const fetchDiscovery = args.fetchDiscovery ?? searchSupplierDiscoveryForSupplier;

  const fingerprintCache = new Map<
    string,
    Awaited<ReturnType<typeof loadSupplierFingerprintFacts>>
  >();
  for (const supplierId of args.candidateSupplierIds) {
    fingerprintCache.set(supplierId, await loadFacts(supplierId));
  }

  await Promise.all(
    args.candidateSupplierIds.map(async (supplierId) => {
      const domain = args.domainBySupplier.get(supplierId) ?? null;
      const hasFingerprint = fingerprintCache.get(supplierId) != null;
      const skippedReason = resolveLiveEvidenceSkippedReason({
        supplierId,
        domain,
        hasFingerprint,
      });

      const baseScore = args.baseScoreBySupplier.get(supplierId) ?? 0;
      const candidateRankBefore = args.rankBeforeBySupplier.get(supplierId);

      if (skippedReason) {
        const record: SupplierLiveEvidenceRecord = {
          liveEvidence: false,
          liveResultCount: 0,
          liveBoost: 0,
          skippedReason,
        };
        evidenceBySupplier.set(supplierId, record);
        logSupplierSearchLiveEvidence({
          event: "supplier_search_live_evidence",
          query: args.query,
          supplierId,
          candidateRankBefore,
          baseScore,
          liveBoost: 0,
          finalScore: baseScore,
          liveResultCount: 0,
          skippedReason,
        });
        return;
      }

      const capture = createRouteEventCapture();
      const start = Date.now();
      let results: SupplierProductResult[] = [];
      try {
        results = await fetchDiscovery(
          supplierId,
          args.productSearchQuery,
          domain,
          { entryPoint: "search_stage2" }
        );
      } catch {
        results = [];
      } finally {
        capture.restore();
      }

      const latencyMs = Date.now() - start;
      const routeEvent = capture.events[capture.events.length - 1];
      const finalStrategyUsed = routeEvent?.finalStrategyUsed;
      const liveResultCount = results.length;
      const liveBoost = computeLiveBoost(liveResultCount, finalStrategyUsed);
      liveBoostBySupplier.set(supplierId, liveBoost);

      const isProfileOnly =
        finalStrategyUsed === "PROBABILISTIC_CATEGORY_PROFILE";
      const record: SupplierLiveEvidenceRecord = {
        liveEvidence:
          liveResultCount > 0 && liveBoost > 0 && !isProfileOnly,
        liveResultCount,
        liveFinalStrategyUsed: finalStrategyUsed,
        liveFallbackDepth: routeEvent?.fallbackDepth,
        liveChainExhausted: routeEvent?.chainExhausted,
        liveLatencyMs: latencyMs,
        liveResultKindSummary: summarizeLiveResultKinds(results),
        ...pickTopLiveResult(results),
        liveBoost,
      };
      evidenceBySupplier.set(supplierId, record);
    })
  );

  const rankedAfter = rankSupplierCards(args.cardsForFinalRank, {
    ...args.rankArgs,
    liveBoostBySupplier,
  });

  const rankAfterBySupplier = new Map<string, number>();
  rankedAfter.forEach((card, index) => {
    rankAfterBySupplier.set(card.supplierId, index + 1);
  });

  for (const supplierId of args.candidateSupplierIds) {
    const evidence = evidenceBySupplier.get(supplierId);
    if (!evidence || evidence.skippedReason) continue;

    const baseScore = args.baseScoreBySupplier.get(supplierId) ?? 0;
    logSupplierSearchLiveEvidence({
      event: "supplier_search_live_evidence",
      query: args.query,
      supplierId,
      candidateRankBefore: args.rankBeforeBySupplier.get(supplierId),
      candidateRankAfter: rankAfterBySupplier.get(supplierId),
      baseScore,
      liveBoost: evidence.liveBoost,
      finalScore: baseScore + evidence.liveBoost,
      liveResultCount: evidence.liveResultCount,
      finalStrategyUsed: evidence.liveFinalStrategyUsed,
      latencyMs: evidence.liveLatencyMs,
    });
  }

  return { evidenceBySupplier, liveBoostBySupplier, rankAfterBySupplier };
}
