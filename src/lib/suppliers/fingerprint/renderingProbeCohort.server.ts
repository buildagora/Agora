import type {
  AntiBotRisk,
  DemandPriority,
  ExtractionStrategy,
  RenderingType,
} from "@prisma/client";
import type { SupplierFingerprintFacts } from "./types";
import { HTML_SCRAPE_ALLOWLIST } from "../routing/resolveHtmlScrapeExecution";
import { SCHEMA_OR_SITEMAP_ALLOWLIST } from "../routing/resolveSchemaOrSitemapExecution";
import {
  isPlatformApiExecutionAllowed,
  isPublicApiExecutionAllowed,
  resolvePlatformCatalogExecution,
} from "../routing/resolvePlatformCatalogExecution";
import { resolveExtractionStrategy } from "../routing/resolveExtractionStrategy";

/** Phase 5.0 — always include for rendering probe + City Electric reassessment. */
export const PHASE_5_RENDERING_PROBE_ANCHORS = [
  "city_electric_hsv",
  "ferguson_plumbing_hsv",
  "srs_hsv",
  "lansing_hsv",
  "shearer_supply_hsv",
  "grainger_hsv",
  "bfs_hsv",
  "ma_supply_hsv",
] as const;

export type RenderingProbeCohortRow = {
  supplierId: string;
  supplierName?: string | null;
  canonicalDomain: string | null;
  renderingType: RenderingType;
  isSPA: boolean | null;
  antiBotRisk: AntiBotRisk;
  demandPriority: DemandPriority;
  demandScore: number | null;
  hasSitemap: boolean | null;
  hasSchemaMarkup: boolean | null;
  detectedPlatform: SupplierFingerprintFacts["detectedPlatform"];
  platformAccessStatus: SupplierFingerprintFacts["platformAccessStatus"];
  publicApiAccessStatus: SupplierFingerprintFacts["publicApiAccessStatus"];
  allowSerpFallback: boolean;
  legacySnapshot: SupplierFingerprintFacts["legacySnapshot"];
};

export type ProvenTierFlags = {
  platformApi: boolean;
  publicApi: boolean;
  schemaOrSitemap: boolean;
  htmlScrape: boolean;
};

export function getProvenTierFlags(
  row: RenderingProbeCohortRow
): ProvenTierFlags {
  const facts = rowToFacts(row);
  const platformConfig = resolvePlatformCatalogExecution(
    row.supplierId,
    row.canonicalDomain
  );
  return {
    platformApi:
      platformConfig != null && isPlatformApiExecutionAllowed(facts),
    publicApi:
      platformConfig != null && isPublicApiExecutionAllowed(facts),
    schemaOrSitemap: SCHEMA_OR_SITEMAP_ALLOWLIST.has(row.supplierId),
    htmlScrape: HTML_SCRAPE_ALLOWLIST.has(row.supplierId),
  };
}

export function isHigherTierProven(row: RenderingProbeCohortRow): boolean {
  const proven = getProvenTierFlags(row);
  return (
    proven.platformApi ||
    proven.publicApi ||
    proven.schemaOrSitemap ||
    proven.htmlScrape
  );
}

function rowToFacts(row: RenderingProbeCohortRow): SupplierFingerprintFacts {
  return {
    supplierId: row.supplierId,
    canonicalDomain: row.canonicalDomain,
    detectedPlatform: row.detectedPlatform,
    platformDetectionConfidence: null,
    platformDetectionSource: null,
    platformAccessStatus: row.platformAccessStatus,
    platformBindingId: null,
    platformBindingValid: false,
    hasPublicApi: null,
    publicApiAccessStatus: row.publicApiAccessStatus,
    publicApiEndpoint: null,
    hasSchemaMarkup: row.hasSchemaMarkup,
    hasSitemap: row.hasSitemap,
    sitemapUrls: null,
    renderingType: row.renderingType,
    isSPA: row.isSPA,
    antiBotRisk: row.antiBotRisk,
    demandPriority: row.demandPriority,
    demandScore: row.demandScore,
    allowSerpFallback: row.allowSerpFallback,
    fingerprintStatus: "SUCCESS",
    lastFingerprintedAt: null,
    legacySnapshot: row.legacySnapshot,
    notes: null,
  };
}

export function scoreRenderingProbeCohortPriority(
  row: RenderingProbeCohortRow
): number {
  let score = 0;

  if (row.allowSerpFallback) score += 20;
  if (row.renderingType === "UNKNOWN") score += 15;
  if (row.legacySnapshot.mode === "site_organic") score += 10;
  if (row.legacySnapshot.matchKind === "generic_domain") score += 8;
  if (row.canonicalDomain) score += 5;
  if (row.demandScore != null) score += Math.min(row.demandScore, 30);
  if (row.demandPriority === "CRITICAL") score += 25;
  else if (row.demandPriority === "HIGH") score += 15;
  else if (row.demandPriority === "MEDIUM") score += 5;

  if (PHASE_5_RENDERING_PROBE_ANCHORS.includes(
    row.supplierId as (typeof PHASE_5_RENDERING_PROBE_ANCHORS)[number]
  )) {
    score += 12;
  }

  if (isHigherTierProven(row)) score -= 100;

  return score;
}

export function selectRenderingProbeCohort(
  rows: RenderingProbeCohortRow[],
  limit = 30
): RenderingProbeCohortRow[] {
  const anchorIds = new Set<string>(PHASE_5_RENDERING_PROBE_ANCHORS);
  const byId = new Map(rows.map((row) => [row.supplierId, row]));

  const selected: RenderingProbeCohortRow[] = [];
  const seen = new Set<string>();

  for (const id of PHASE_5_RENDERING_PROBE_ANCHORS) {
    const row = byId.get(id);
    if (row?.canonicalDomain && !seen.has(id)) {
      selected.push(row);
      seen.add(id);
    }
  }

  const ranked = rows
    .filter((row) => row.allowSerpFallback && row.canonicalDomain)
    .filter((row) => !isHigherTierProven(row))
    .filter((row) => !seen.has(row.supplierId))
    .sort(
      (a, b) =>
        scoreRenderingProbeCohortPriority(b) -
        scoreRenderingProbeCohortPriority(a)
    );

  for (const row of ranked) {
    if (selected.length >= limit) break;
    selected.push(row);
    seen.add(row.supplierId);
  }

  return selected.slice(0, limit);
}

export function recommendStrategyForFacts(
  facts: SupplierFingerprintFacts,
  options?: { allowPlaywright?: boolean }
): ExtractionStrategy {
  return resolveExtractionStrategy({
    supplierId: facts.supplierId,
    canonicalDomain: facts.canonicalDomain,
    facts,
    options,
  }).primaryStrategy;
}

export type PlaywrightCandidateScore = {
  supplierId: string;
  score: number;
  reasons: string[];
};

export function scorePlaywrightCandidate(input: {
  supplierId: string;
  renderingType: RenderingType;
  isSPA: boolean | null;
  antiBotRisk: AntiBotRisk;
  demandPriority: DemandPriority;
  demandScore: number | null;
  proven: ProvenTierFlags;
}): PlaywrightCandidateScore {
  const reasons: string[] = [];
  let score = 0;

  if (input.proven.platformApi || input.proven.publicApi) {
    reasons.push("tier1_proven");
    return { supplierId: input.supplierId, score: -100, reasons };
  }
  if (input.proven.schemaOrSitemap || input.proven.htmlScrape) {
    reasons.push("tier2_proven");
    return { supplierId: input.supplierId, score: -100, reasons };
  }

  if (input.antiBotRisk === "HARD_BLOCK") {
    reasons.push("hard_block");
    return { supplierId: input.supplierId, score: -100, reasons };
  }
  if (input.antiBotRisk === "HIGH") {
    reasons.push("high_antibot");
    score -= 50;
  }

  const spaLike =
    input.isSPA === true ||
    input.renderingType === "SPA" ||
    input.renderingType === "HYBRID";

  if (!spaLike) {
    reasons.push("not_spa");
    return { supplierId: input.supplierId, score: Math.min(score, 0), reasons };
  }

  if (input.renderingType === "SPA") {
    score += 30;
    reasons.push("rendering_spa");
  } else if (input.renderingType === "HYBRID") {
    score += 20;
    reasons.push("rendering_hybrid");
  }
  if (input.isSPA === true) {
    score += 10;
    reasons.push("is_spa_true");
  }

  if (input.antiBotRisk === "LOW") {
    score += 15;
    reasons.push("antibot_low");
  } else if (input.antiBotRisk === "MEDIUM") {
    score += 5;
    reasons.push("antibot_medium");
  }

  if (input.demandPriority === "CRITICAL") {
    score += 25;
    reasons.push("demand_critical");
  } else if (input.demandPriority === "HIGH") {
    score += 15;
    reasons.push("demand_high");
  } else if (input.demandPriority === "MEDIUM") {
    score += 5;
    reasons.push("demand_medium");
  } else {
    reasons.push("demand_low");
    score -= 10;
  }

  if (input.demandScore != null && input.demandScore >= 20) {
    score += 10;
    reasons.push("demand_score_high");
  }

  return { supplierId: input.supplierId, score, reasons };
}

export function rankPlaywrightCandidates(
  rows: Array<
    RenderingProbeCohortRow & {
      probeRenderingType: RenderingType;
      probeIsSPA: boolean | null;
      probeAntiBotRisk: AntiBotRisk;
    }
  >
): PlaywrightCandidateScore[] {
  return rows
    .map((row) =>
      scorePlaywrightCandidate({
        supplierId: row.supplierId,
        renderingType: row.probeRenderingType,
        isSPA: row.probeIsSPA,
        antiBotRisk: row.probeAntiBotRisk,
        demandPriority: row.demandPriority,
        demandScore: row.demandScore,
        proven: getProvenTierFlags(row),
      })
    )
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);
}

export type CityElectricReassessment = {
  supplierId: string;
  domain: string;
  probeRenderingType: RenderingType;
  probeIsSPA: boolean | null;
  probeAntiBotRisk: AntiBotRisk;
  pilotPass: boolean | null;
  pilotCloudflareBlocked: boolean | null;
  pilotProductCount: number | null;
  spaEvidence: string;
  antiBotEvidence: string;
  playwrightJustified: boolean;
  recommendedFutureStrategy: "PLAYWRIGHT" | "ANTI_BOT_EVALUATION" | "NEITHER";
  rationale: string;
};

export function assessCityElectric(input: {
  probeRenderingType: RenderingType;
  probeIsSPA: boolean | null;
  probeAntiBotRisk: AntiBotRisk;
  pilotPass?: boolean | null;
  pilotCloudflareBlocked?: boolean | null;
  pilotProductCount?: number | null;
}): CityElectricReassessment {
  const spaLike =
    input.probeIsSPA === true ||
    input.probeRenderingType === "SPA" ||
    input.probeRenderingType === "HYBRID";

  const spaEvidence = spaLike
    ? `Probe suggests ${input.probeRenderingType} (isSPA=${String(input.probeIsSPA)})`
    : `No SPA evidence (renderingType=${input.probeRenderingType}, isSPA=${String(input.probeIsSPA)})`;

  const antiBotEvidence =
    input.pilotCloudflareBlocked === true
      ? "Playwright pilot: Cloudflare hard block; probe antiBotRisk=" +
        input.probeAntiBotRisk
      : input.probeAntiBotRisk === "HARD_BLOCK" ||
          input.probeAntiBotRisk === "HIGH"
        ? `Probe antiBotRisk=${input.probeAntiBotRisk}`
        : `Probe antiBotRisk=${input.probeAntiBotRisk}; no hard block in pilot`;

  const playwrightJustified =
    spaLike &&
    (input.probeAntiBotRisk === "LOW" || input.probeAntiBotRisk === "MEDIUM") &&
    input.pilotCloudflareBlocked !== true &&
    (input.pilotProductCount ?? 0) > 0;

  let recommendedFutureStrategy: CityElectricReassessment["recommendedFutureStrategy"] =
    "NEITHER";
  let rationale: string;

  if (
    input.pilotCloudflareBlocked === true ||
    input.probeAntiBotRisk === "HARD_BLOCK" ||
    input.probeAntiBotRisk === "HIGH"
  ) {
    recommendedFutureStrategy = "ANTI_BOT_EVALUATION";
    rationale =
      "Primary blocker is anti-bot (Cloudflare hard block / HIGH risk), not missing JS rendering. Future work should classify and record risk, not bypass with Playwright.";
  } else if (playwrightJustified) {
    recommendedFutureStrategy = "PLAYWRIGHT";
    rationale =
      "SPA/HYBRID with low anti-bot and successful browser extraction would justify cache-only Playwright.";
  } else if (!spaLike) {
    recommendedFutureStrategy = "NEITHER";
    rationale =
      "Site does not show SPA/HYBRID rendering gap; SERP/profile or tier-2 fetch strategies remain appropriate.";
  } else {
    recommendedFutureStrategy = "NEITHER";
    rationale =
      "SPA signals present but insufficient evidence of viable anonymous browser extraction.";
  }

  return {
    supplierId: "city_electric_hsv",
    domain: "cityelectricsupply.com",
    probeRenderingType: input.probeRenderingType,
    probeIsSPA: input.probeIsSPA,
    probeAntiBotRisk: input.probeAntiBotRisk,
    pilotPass: input.pilotPass ?? null,
    pilotCloudflareBlocked: input.pilotCloudflareBlocked ?? null,
    pilotProductCount: input.pilotProductCount ?? null,
    spaEvidence,
    antiBotEvidence,
    playwrightJustified,
    recommendedFutureStrategy,
    rationale,
  };
}
