import type { ExtractionStrategy } from "@prisma/client";
import type { SupplierExtractionRouteEvent } from "../../src/lib/suppliers/routing/routerTelemetry";
import type { StrategyExecutionAttempt } from "../../src/lib/suppliers/routing/types";
import { isDirectExtractionStrategy } from "../../src/lib/suppliers/routing/types";

/** Phase 6B proven-v1 validation cohort. */
export const PROVEN_V1_COHORT = [
  "johnstone_hsv",
  "floor_decor_hsv",
  "abc_supply_hsv",
  "gulfeagle_hsv",
  "trane_supply_hsv",
  "wittichen_hsv",
  "re_michel_hsv",
] as const;

export type ProvenV1SupplierId = (typeof PROVEN_V1_COHORT)[number];

/** Phase 8E.2 platform API cohort — promoted in 8E.2d via registry only. */
export const PLATFORM_API_COHORT = [
  "ll_flooring_hsv",
  "cmn90dbjr000404ldzhcsquav",
  "lennox_hsv",
  "siteone_hsv",
  "siteone_north_hsv",
] as const;

export type PlatformApiCohortSupplierId = (typeof PLATFORM_API_COHORT)[number];

/** Phase 8F.3 — validated platform + schema suppliers promoted via registry only. */
export const PHASE_8F3_PROMOTED = [
  "ppg_paint_hsv",
  "ferguson_plumbing_hsv",
] as const;

/**
 * Phase 9.1 — all domain-bearing suppliers (orchestrator adoption universe).
 * Canonical mirror of `FINGERPRINT_ROUTER_PROMOTED_SUPPLIERS` after 9.1 rollout.
 */
export const DOMAIN_SUPPLIER_COHORT = [
  "84_lumber_mad",
  "abc_supply_hsv",
  "absolute_glass",
  "acme_brick_madison",
  "adco_pipe_hsv",
  "alabama_countertops",
  "american_pipe_hsv",
  "anixter_hsv",
  "associated_masonry_madison",
  "baker_hsv",
  "bama_gutters",
  "bfs_hsv",
  "capitol_materials_athens",
  "capitol_materials_madison",
  "carpet_one_hsv",
  "city_electric_hsv",
  "city_lumber_hsv",
  "cmn90dbjr000404ldzhcsquav",
  "daltile_hsv",
  "discount_metal_hsv",
  "east_coast_metal_hsv",
  "eastern_industrial_hsv",
  "ecmd_hsv",
  "electronic_fasteners_hsv",
  "esc_supply_hsv",
  "ewing_hsv",
  "extreme_stones",
  "farrell_calhoun",
  "fastenal_hsv",
  "fastening_solutions_hsv",
  "fbm_hsv",
  "fence1_distribution",
  "ferguson_hvac_hsv",
  "ferguson_plumbing_hsv",
  "floor_decor_hsv",
  "floor_decor_madison",
  "general_shale_hsv",
  "gls_supply_hsv",
  "grainger_hsv",
  "graybar_hsv",
  "gulfeagle_hsv",
  "harbor_freight_hsv",
  "henley_supply",
  "herringtons_hsv",
  "home_depot_hsv",
  "home_depot_madison",
  "home_depot_north_hsv",
  "home_depot_south_hsv",
  "home_depot_west_hsv",
  "huntsville_fastener",
  "huntsville_glass",
  "huntsville_granite",
  "imperial_fence_supply",
  "industrial_contractor_supply",
  "inline_electric_hsv",
  "johnstone_hsv",
  "kenny_pipe_hsv",
  "lansing_hsv",
  "lennox_hsv",
  "ll_flooring_hsv",
  "lowes_hsv",
  "lowes_madison",
  "lowes_madison_hsv",
  "lowes_north_hsv",
  "lowes_south_hsv",
  "lw_supply_hsv",
  "ma_supply_hsv",
  "mayer_electric_hsv",
  "mcneese_glass",
  "metal_supermarkets_hsv",
  "metaltek_hsv",
  "mingledorffs_hsv",
  "national_coatings",
  "north_aluminum",
  "northern_tool_hsv",
  "park_supply_hsv",
  "parker_industrial_hsv",
  "pinnacle_surfaces",
  "ppg_paint_hsv",
  "prosource_hsv",
  "re_michel_hsv",
  "ready_mix_usa_hsv",
  "redstone_electric_hsv",
  "robert_henry_tile_hsv",
  "sand_mountain_brick",
  "service_partners_hsv",
  "service_steel_hsv",
  "shearer_supply_hsv",
  "siteone_hsv",
  "siteone_north_hsv",
  "southern_carlson_hsv",
  "southern_pipe_hsv",
  "southland_hsv",
  "spectra_gutter",
  "srm_concrete_hsv",
  "srs_hsv",
  "summertown_metals_tn",
  "sunbelt_hsv",
  "supply_technologies_hsv",
  "sw_auto_finishes",
  "sw_commercial_meridian",
  "sw_madison_commercial",
  "sw_memorial_nw",
  "sw_memorial_sw",
  "sw_monroe",
  "sw_owens_cross",
  "sw_product_finishes",
  "tile_liquidators",
  "tile_stone_market_hsv",
  "tractor_supply_madison",
  "trane_supply_hsv",
  "triton_stone_hsv",
  "tw_metals_hsv",
  "united_rentals_hsv",
  "us_brick_madison",
  "vulcan_materials_hsv",
  "wholesale_vinyl_fencing",
  "wilson_lumber_hsv",
  "winsupply_hsv",
  "wittichen_hsv",
] as const;

export type DomainSupplierId = (typeof DOMAIN_SUPPLIER_COHORT)[number];

/** Production promotion registry mirror — `FINGERPRINT_ROUTER_PROMOTED_SUPPLIERS`. */
export const ROUTER_PROMOTED_SUPPLIERS = [...DOMAIN_SUPPLIER_COHORT] as const;

/** Phase 8F.2 — platform credential cohort (activation audit; not promoted). */
export const PLATFORM_CREDENTIAL_COHORT = [
  "baker_hsv",
  "ecmd_hsv",
  "east_coast_metal_hsv",
  "mingledorffs_hsv",
  "harbor_freight_hsv",
  "fbm_hsv",
  "ppg_paint_hsv",
] as const;

/** Phase 8F.2 — schema activation cohort (allowlist expansion; not promoted). */
export const SCHEMA_ACTIVATION_COHORT = [
  "grainger_hsv",
  "ferguson_plumbing_hsv",
  "srs_hsv",
  "shearer_supply_hsv",
  "bfs_hsv",
  "city_electric_hsv",
] as const;

/** Five realistic queries per supplier (Phase 6B plan). */
export const PROVEN_V1_QUERY_MATRIX: Record<ProvenV1SupplierId, readonly string[]> = {
  johnstone_hsv: [
    "filter drier",
    "compressor",
    "refrigerant R410A",
    "thermostat",
    "condenser motor",
  ],
  floor_decor_hsv: [
    "porcelain tile",
    "grout",
    "thinset",
    "floor transition",
    "mosaic tile",
  ],
  abc_supply_hsv: [
    "GAF Timberline shingles",
    "ridge vent",
    "ice and water shield",
    "drip edge",
    "roofing nails",
  ],
  gulfeagle_hsv: [
    "shingles",
    "ridge vent",
    "underlayment",
    "roof coating",
    "metal roofing",
  ],
  trane_supply_hsv: [
    "commercial HVAC",
    "air handler",
    "rooftop unit",
    "HVAC repair",
    "condenser",
  ],
  wittichen_hsv: [
    "furnace",
    "condenser",
    "thermostat",
    "refrigerant",
    "hvac parts",
  ],
  re_michel_hsv: [
    "boiler",
    "water heater",
    "copper pipe",
    "thermostat",
    "gas valve",
  ],
};

/** Domain overrides when DB supplier.domain is missing or wrong. */
export const PROVEN_V1_DOMAIN_OVERRIDES: Partial<Record<ProvenV1SupplierId, string>> =
  {
    abc_supply_hsv: "abcsupply.com",
  };

/** Suppliers that may pass parity but should stay on named cohort (no auto-enable). */
export const PROVEN_V1_DEFER_AUTO_ENABLE = new Set<ProvenV1SupplierId>([
  "abc_supply_hsv",
  "gulfeagle_hsv",
  "trane_supply_hsv",
]);

export type ParityCellInput = {
  resultCountLegacy: number;
  resultCountRouter: number;
  executionPath?: SupplierExtractionRouteEvent["executionPath"];
  finalStrategyUsed?: ExtractionStrategy;
  fallbackDepth?: number;
  chainExhausted?: boolean;
  attemptedStrategies?: StrategyExecutionAttempt[];
  primaryStrategy?: ExtractionStrategy;
};

export type ParityCellOutcome = "pass" | "fail";

export type ParityCellClassification = {
  outcome: ParityCellOutcome;
  passReason?: string;
  failReason?: string;
};

export type AntiBotAttemptSummary = {
  pagesBlocked: number;
  antiBotCategory?: string;
  blockedUrlClass?: string;
};

export type ParityCellRecord = {
  supplierId: string;
  query: string;
  primaryStrategy?: string;
  resultCountLegacy: number;
  latencyMsLegacy: number;
  resultCountRouter: number;
  latencyMsRouter: number;
  executionPath?: string;
  finalStrategyUsed?: string;
  fallbackDepth?: number;
  chainExhausted?: boolean;
  attemptedStrategies?: StrategyExecutionAttempt[];
  pagesBlocked: number;
  antiBotCategory?: string;
  blockedUrlClass?: string;
  outcome: ParityCellOutcome;
  passReason?: string;
  failReason?: string;
};

export type SupplierParitySummary = {
  supplierId: string;
  passes: number;
  fails: number;
  avgLatencyLegacy: number;
  avgLatencyRouter: number;
  mostCommonFinalStrategy: string;
  chainExhaustedCount: number;
  primaryStrategySuccessCount: number;
  shadowMatchStatus?: string;
  promotionRecommendation: PromotionRecommendation;
};

export type PromotionRecommendation = "PROMOTE" | "HOLD" | "INVESTIGATE";

export function summarizeAntiBotAttempts(
  attempts: StrategyExecutionAttempt[] | undefined
): AntiBotAttemptSummary {
  let pagesBlocked = 0;
  let antiBotCategory: string | undefined;
  let blockedUrlClass: string | undefined;

  for (const attempt of attempts ?? []) {
    pagesBlocked += attempt.pagesBlocked ?? attempt.productPagesBlocked ?? 0;
    if (attempt.antiBotCategory) antiBotCategory = attempt.antiBotCategory;
    if (attempt.blockedUrlClass) blockedUrlClass = attempt.blockedUrlClass;
  }

  return { pagesBlocked, antiBotCategory, blockedUrlClass };
}

export function classifyParityCell(input: ParityCellInput): ParityCellClassification {
  const {
    resultCountLegacy,
    resultCountRouter,
    executionPath,
    finalStrategyUsed,
    chainExhausted,
  } = input;

  if (resultCountRouter === 0 && resultCountLegacy > 0) {
    if (executionPath === "router") {
      return {
        outcome: "fail",
        failReason: "chain_success_empty_while_legacy_had_results",
      };
    }
    if (chainExhausted) {
      return {
        outcome: "fail",
        failReason: "chain_exhausted_zero_results_while_legacy_had_results",
      };
    }
    return {
      outcome: "fail",
      failReason: "router_zero_results_while_legacy_had_results",
    };
  }

  if (resultCountRouter >= resultCountLegacy) {
    return {
      outcome: "pass",
      passReason: "router_count_gte_legacy",
    };
  }

  if (
    resultCountRouter > 0 &&
    executionPath === "router" &&
    finalStrategyUsed &&
    isDirectExtractionStrategy(finalStrategyUsed)
  ) {
    return {
      outcome: "pass",
      passReason: "higher_tier_success_fewer_results",
    };
  }

  return {
    outcome: "fail",
    failReason: "router_fewer_results_without_higher_tier_success",
  };
}

export function mostCommonFinalStrategy(
  cells: Pick<ParityCellRecord, "finalStrategyUsed">[]
): string {
  const counts = new Map<string, number>();
  for (const cell of cells) {
    const key = cell.finalStrategyUsed?.trim() || "(none)";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  let best = "(none)";
  let bestCount = 0;
  for (const [key, count] of counts) {
    if (count > bestCount) {
      best = key;
      bestCount = count;
    }
  }
  return best;
}

export function recommendSupplierPromotion(input: {
  supplierId: string;
  passes: number;
  fails: number;
  totalQueries: number;
  primaryStrategySuccessCount: number;
  chainExhaustedWithLegacySuccessCount: number;
  shadowMatchStatus?: string;
}): PromotionRecommendation {
  const {
    supplierId,
    passes,
    fails,
    totalQueries,
    primaryStrategySuccessCount,
    chainExhaustedWithLegacySuccessCount,
    shadowMatchStatus,
  } = input;

  if (shadowMatchStatus === "INVESTIGATE") {
    return "INVESTIGATE";
  }

  const passThreshold = Math.min(4, totalQueries);
  const parityMet = passes >= passThreshold;
  const hasPrimaryWin = primaryStrategySuccessCount >= 1;

  if (
    chainExhaustedWithLegacySuccessCount >= 3 &&
    fails > 0
  ) {
    return "INVESTIGATE";
  }

  if (parityMet && hasPrimaryWin) {
    if (PROVEN_V1_DEFER_AUTO_ENABLE.has(supplierId as ProvenV1SupplierId)) {
      return "HOLD";
    }
    return "PROMOTE";
  }

  if (passes >= 3) {
    return "HOLD";
  }

  return "INVESTIGATE";
}

export function buildSupplierSummaries(
  cells: ParityCellRecord[],
  shadowBySupplier: Record<string, string | undefined>
): SupplierParitySummary[] {
  const bySupplier = new Map<string, ParityCellRecord[]>();
  for (const cell of cells) {
    const list = bySupplier.get(cell.supplierId) ?? [];
    list.push(cell);
    bySupplier.set(cell.supplierId, list);
  }

  const summaries: SupplierParitySummary[] = [];

  for (const [supplierId, supplierCells] of bySupplier) {
    const passes = supplierCells.filter((c) => c.outcome === "pass").length;
    const fails = supplierCells.filter((c) => c.outcome === "fail").length;
    const avgLatencyLegacy =
      supplierCells.reduce((sum, c) => sum + c.latencyMsLegacy, 0) /
      supplierCells.length;
    const avgLatencyRouter =
      supplierCells.reduce((sum, c) => sum + c.latencyMsRouter, 0) /
      supplierCells.length;

    const primaryStrategySuccessCount = supplierCells.filter(
      (c) =>
        c.executionPath === "router" &&
        c.finalStrategyUsed &&
        c.primaryStrategy &&
        c.finalStrategyUsed === c.primaryStrategy &&
        c.resultCountRouter > 0
    ).length;

    const chainExhaustedWithLegacySuccessCount = supplierCells.filter(
      (c) =>
        c.chainExhausted === true &&
        c.resultCountLegacy > 0 &&
        c.resultCountRouter === 0
    ).length;

    summaries.push({
      supplierId,
      passes,
      fails,
      avgLatencyLegacy: Math.round(avgLatencyLegacy),
      avgLatencyRouter: Math.round(avgLatencyRouter),
      mostCommonFinalStrategy: mostCommonFinalStrategy(supplierCells),
      chainExhaustedCount: supplierCells.filter((c) => c.chainExhausted).length,
      primaryStrategySuccessCount,
      shadowMatchStatus: shadowBySupplier[supplierId],
      promotionRecommendation: recommendSupplierPromotion({
        supplierId,
        passes,
        fails,
        totalQueries: supplierCells.length,
        primaryStrategySuccessCount,
        chainExhaustedWithLegacySuccessCount,
        shadowMatchStatus: shadowBySupplier[supplierId],
      }),
    });
  }

  return summaries.sort((a, b) => a.supplierId.localeCompare(b.supplierId));
}

export function buildParityCsvRows(cells: ParityCellRecord[]): string {
  const header = [
    "supplierId",
    "query",
    "outcome",
    "passReason",
    "failReason",
    "resultCountLegacy",
    "latencyMsLegacy",
    "resultCountRouter",
    "latencyMsRouter",
    "executionPath",
    "finalStrategyUsed",
    "fallbackDepth",
    "chainExhausted",
    "pagesBlocked",
    "antiBotCategory",
    "blockedUrlClass",
  ].join(",");

  const escape = (value: string): string => {
    if (value.includes(",") || value.includes('"') || value.includes("\n")) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  };

  const body = cells
    .map((cell) =>
      [
        cell.supplierId,
        cell.query,
        cell.outcome,
        cell.passReason ?? "",
        cell.failReason ?? "",
        String(cell.resultCountLegacy),
        String(cell.latencyMsLegacy),
        String(cell.resultCountRouter),
        String(cell.latencyMsRouter),
        cell.executionPath ?? "",
        cell.finalStrategyUsed ?? "",
        cell.fallbackDepth == null ? "" : String(cell.fallbackDepth),
        cell.chainExhausted == null ? "" : String(cell.chainExhausted),
        String(cell.pagesBlocked),
        cell.antiBotCategory ?? "",
        cell.blockedUrlClass ?? "",
      ]
        .map(escape)
        .join(",")
    )
    .join("\n");

  return `${header}\n${body}\n`;
}

export function buildParityReportSummary(cells: ParityCellRecord[]): {
  totalCells: number;
  passCount: number;
  failCount: number;
  supplierPassCount: number;
  supplierFailCount: number;
} {
  const passCount = cells.filter((c) => c.outcome === "pass").length;
  const failCount = cells.filter((c) => c.outcome === "fail").length;
  const supplierOutcomes = new Map<string, boolean>();

  for (const cell of cells) {
    const prev = supplierOutcomes.get(cell.supplierId);
    if (cell.outcome === "fail") {
      supplierOutcomes.set(cell.supplierId, false);
    } else if (prev !== false) {
      supplierOutcomes.set(cell.supplierId, true);
    }
  }

  let supplierPassCount = 0;
  let supplierFailCount = 0;
  for (const passed of supplierOutcomes.values()) {
    if (passed) supplierPassCount += 1;
    else supplierFailCount += 1;
  }

  return {
    totalCells: cells.length,
    passCount,
    failCount,
    supplierPassCount,
    supplierFailCount,
  };
}

export function expandProvenV1Matrix(input?: {
  supplierId?: string;
  query?: string;
}): Array<{ supplierId: ProvenV1SupplierId; query: string }> {
  const suppliers = input?.supplierId
    ? PROVEN_V1_COHORT.filter((id) => id === input.supplierId)
    : [...PROVEN_V1_COHORT];

  const cells: Array<{ supplierId: ProvenV1SupplierId; query: string }> = [];
  for (const supplierId of suppliers) {
    const queries = input?.query
      ? PROVEN_V1_QUERY_MATRIX[supplierId].filter((q) => q === input.query)
      : PROVEN_V1_QUERY_MATRIX[supplierId];
    for (const query of queries) {
      cells.push({ supplierId, query });
    }
  }
  return cells;
}
