/**
 * Phase 9.4 — Category A recovery strategy (analysis only, no fixes).
 *
 *   npm run fingerprint:phase9.4-strategy
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { readFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { getPrisma } from "../../src/lib/db.server";
import { loadSupplierFingerprintFacts } from "../../src/lib/suppliers/fingerprint/loadSupplierFingerprintFacts.server";
import { resolveExtractionStrategy } from "../../src/lib/suppliers/routing/resolveExtractionStrategy";
import {
  HTML_SCRAPE_ALLOWLIST,
} from "../../src/lib/suppliers/routing/resolveHtmlScrapeExecution";
import { SCHEMA_OR_SITEMAP_ALLOWLIST as SCHEMA_ALLOWLIST } from "../../src/lib/suppliers/routing/resolveSchemaOrSitemapExecution";

const PHASE_93_ARTIFACT =
  "scripts/output/fingerprint/phase9.3-root-cause-audit-2026-06-06T21-17-58-834Z.json";

const CURRENT_ROUTER_WINNERS = 22;

type Decomposition =
  | "QUERY_MISMATCH"
  | "IMAGE_EXTRACTION_FAILURE"
  | "HTML_ALLOWLIST_GAP"
  | "SCHEMA_ALLOWLIST_GAP"
  | "PARSER_FAILURE"
  | "CHAIN_ORDER_PROBLEM"
  | "UNKNOWN";

type Diagnostic = {
  supplierId: string;
  domain: string | null;
  plannedStrategy: string;
  rootCause: string;
  phase92Query: string;
  auditQuery: string;
  queryChanged: boolean;
  reprobeResultCount: number;
  reprobeChainExhausted: boolean;
  reprobeWouldWin: boolean;
  serpProbe?: {
    organicRawCount: number;
    organicSameDomainCount: number;
    agoraExtractedCount: number;
    apiError: string | null;
  };
  attemptedStrategies?: {
    strategy: string;
    status: string;
    reason?: string;
    resultCount?: number;
    serpOrganicCount?: number;
  }[];
  htmlAllowlisted: boolean;
  schemaAllowlisted: boolean;
};

function assignDecomposition(row: Diagnostic): Decomposition {
  const htmlAttempt = row.attemptedStrategies?.find((a) => a.strategy === "HTML_SCRAPE");
  const schemaAttempt = row.attemptedStrategies?.find(
    (a) => a.strategy === "SCHEMA_OR_SITEMAP"
  );
  const serpAttempt = row.attemptedStrategies?.find(
    (a) => a.strategy === "SERP_SITE_ORGANIC"
  );

  if (
    row.rootCause === "CONFIGURATION_GAP" &&
    row.plannedStrategy === "HTML_SCRAPE"
  ) {
    return "HTML_ALLOWLIST_GAP";
  }
  if (
    row.rootCause === "CONFIGURATION_GAP" &&
    row.plannedStrategy === "SCHEMA_OR_SITEMAP"
  ) {
    return "SCHEMA_ALLOWLIST_GAP";
  }

  if (
    row.rootCause === "QUERY_MISMATCH" ||
    (row.queryChanged &&
      row.phase92Query === "supplies" &&
      row.reprobeResultCount > 0)
  ) {
    return "QUERY_MISMATCH";
  }

  const organic = row.serpProbe?.organicSameDomainCount ?? 0;
  const extracted = row.serpProbe?.agoraExtractedCount ?? 0;
  if (
    organic > 0 &&
    extracted === 0 &&
    row.reprobeResultCount === 0 &&
    row.plannedStrategy === "SERP_SITE_ORGANIC"
  ) {
    return "IMAGE_EXTRACTION_FAILURE";
  }

  if (
    row.htmlAllowlisted &&
    htmlAttempt?.status === "empty" &&
    (htmlAttempt.serpOrganicCount ?? 0) > 0
  ) {
    return "PARSER_FAILURE";
  }

  if (
    (row.plannedStrategy === "HTML_SCRAPE" ||
      row.plannedStrategy === "SCHEMA_OR_SITEMAP") &&
    !row.htmlAllowlisted &&
    row.plannedStrategy === "HTML_SCRAPE" &&
    serpAttempt?.status === "success" &&
    row.reprobeWouldWin
  ) {
    return "CHAIN_ORDER_PROBLEM";
  }

  if (
    row.plannedStrategy === "SCHEMA_OR_SITEMAP" &&
    schemaAttempt?.status === "empty" &&
    serpAttempt?.status === "success" &&
    row.reprobeWouldWin
  ) {
    return "CHAIN_ORDER_PROBLEM";
  }

  if (row.rootCause === "EXTRACTION_FAILURE" && organic > 0) {
    return "IMAGE_EXTRACTION_FAILURE";
  }

  return "UNKNOWN";
}

function imageFailureMode(row: Diagnostic): string {
  const organic = row.serpProbe?.organicSameDomainCount ?? 0;
  const extracted = row.serpProbe?.agoraExtractedCount ?? 0;
  if (organic === 0) return "no_organic_results";
  if (extracted > 0) return "not_image_gated";
  if (row.reprobeResultCount > 0) return "query_resolved";
  return "thumbnail_or_page_image_missing";
}

const HIGHER_TIERS = new Set([
  "PUBLIC_API",
  "PLATFORM_API",
  "SCHEMA_OR_SITEMAP",
  "HTML_SCRAPE",
]);

async function main() {
  const phase93 = JSON.parse(await readFile(PHASE_93_ARTIFACT, "utf8")) as {
    fullSupplierDiagnostics: Diagnostic[];
  };
  const categoryA = phase93.fullSupplierDiagnostics.filter(
    (r) => (r as { opportunityCategory: string }).opportunityCategory === "A"
  ) as (Diagnostic & { opportunityCategory: string })[];

  const decompositionCounts: Record<Decomposition, number> = {
    QUERY_MISMATCH: 0,
    IMAGE_EXTRACTION_FAILURE: 0,
    HTML_ALLOWLIST_GAP: 0,
    SCHEMA_ALLOWLIST_GAP: 0,
    PARSER_FAILURE: 0,
    CHAIN_ORDER_PROBLEM: 0,
    UNKNOWN: 0,
  };

  const decomposed: {
    supplierId: string;
    decomposition: Decomposition;
    reprobeWouldWin: boolean;
    reprobeResultCount: number;
  }[] = [];

  const executorAudit: {
    supplierId: string;
    primaryStrategy: string;
    classification: "CORRECTLY_ON_SERP" | "MISCLASSIFIED_TO_SERP";
    reason: string;
    higherTierAvailable?: string;
  }[] = [];

  const imageAnalysis: {
    supplierId: string;
    organicSameDomainCount: number;
    agoraExtractedCount: number;
    failureMode: string;
    reprobeResultCount: number;
  }[] = [];

  for (const row of categoryA) {
    const decomposition = assignDecomposition(row);
    decompositionCounts[decomposition] += 1;
    decomposed.push({
      supplierId: row.supplierId,
      decomposition,
      reprobeWouldWin: row.reprobeWouldWin,
      reprobeResultCount: row.reprobeResultCount,
    });

    if (row.serpProbe) {
      imageAnalysis.push({
        supplierId: row.supplierId,
        organicSameDomainCount: row.serpProbe.organicSameDomainCount,
        agoraExtractedCount: row.serpProbe.agoraExtractedCount,
        failureMode: imageFailureMode(row),
        reprobeResultCount: row.reprobeResultCount,
      });
    }

    const facts = await loadSupplierFingerprintFacts(row.supplierId);
    if (!facts) continue;
    const plan = resolveExtractionStrategy({
      supplierId: row.supplierId,
      facts,
      canonicalDomain: facts.canonicalDomain,
    });

    const primary = plan.primaryStrategy;
    const isSerpPrimary =
      primary === "SERP_SITE_ORGANIC" || primary === "SERP_PRODUCT_ENGINE";

    if (isSerpPrimary) {
      const viableHigher = plan.viabilityByStrategy.filter(
        (v) => HIGHER_TIERS.has(v.strategy) && v.viable
      );
      if (viableHigher.length > 0) {
        executorAudit.push({
          supplierId: row.supplierId,
          primaryStrategy: primary,
          classification: "MISCLASSIFIED_TO_SERP",
          reason: `Higher tier viable: ${viableHigher.map((v) => v.strategy).join(", ")}`,
          higherTierAvailable: viableHigher[0]?.strategy,
        });
      } else {
        executorAudit.push({
          supplierId: row.supplierId,
          primaryStrategy: primary,
          classification: "CORRECTLY_ON_SERP",
          reason: "No higher-tier strategy viable per fingerprint",
        });
      }
    } else if (
      row.plannedStrategy === "HTML_SCRAPE" &&
      !HTML_SCRAPE_ALLOWLIST.has(row.supplierId)
    ) {
      executorAudit.push({
        supplierId: row.supplierId,
        primaryStrategy: primary,
        classification: "MISCLASSIFIED_TO_SERP",
        reason: "HTML_SCRAPE primary but not allowlisted — execution falls to SERP",
        higherTierAvailable: "HTML_SCRAPE",
      });
    } else if (
      row.plannedStrategy === "SCHEMA_OR_SITEMAP" &&
      !SCHEMA_ALLOWLIST.has(row.supplierId)
    ) {
      executorAudit.push({
        supplierId: row.supplierId,
        primaryStrategy: primary,
        classification: "MISCLASSIFIED_TO_SERP",
        reason: "SCHEMA primary but not allowlisted",
        higherTierAvailable: "SCHEMA_OR_SITEMAP",
      });
    } else {
      executorAudit.push({
        supplierId: row.supplierId,
        primaryStrategy: primary,
        classification: "CORRECTLY_ON_SERP",
        reason: "Primary is direct extraction strategy",
      });
    }
  }

  const imageGated = imageAnalysis.filter(
    (r) => r.failureMode === "thumbnail_or_page_image_missing"
  );
  const queryOnlyFailures = categoryA.filter(
    (r) => r.phase92Query === "supplies" && r.reprobeResultCount === 0
  );
  const queryWinFailures = categoryA.filter(
    (r) => r.phase92Query === "supplies" && r.reprobeResultCount > 0
  );

  const reprobeWins = categoryA.filter((r) => r.reprobeWouldWin).length;
  const reprobeResults = categoryA.filter((r) => r.reprobeResultCount > 0).length;

  const fixImpact = [
    {
      fix: "Category-aware probe queries (audit script + search defaults)",
      affected: decompositionCounts.QUERY_MISMATCH,
      expectedRecovered: categoryA.filter(
        (r) =>
          assignDecomposition(r) === "QUERY_MISMATCH" && r.reprobeWouldWin
      ).length,
      effort: "LOW",
      serpCostDelta: "NONE (metadata-only query selection)",
      risk: "LOW",
    },
    {
      fix: "SERP image resolution improvements (keep image requirement)",
      affected: decompositionCounts.IMAGE_EXTRACTION_FAILURE,
      expectedRecovered: categoryA.filter(
        (r) =>
          assignDecomposition(r) === "IMAGE_EXTRACTION_FAILURE" &&
          r.reprobeResultCount === 0
      ).length,
      effort: "MEDIUM",
      serpCostDelta: "LOW (reuse existing organic URLs; more page fetches)",
      risk: "MEDIUM",
    },
    {
      fix: "HTML_SCRAPE allowlist expansion (9 suppliers)",
      affected: decompositionCounts.HTML_ALLOWLIST_GAP,
      expectedRecovered: categoryA.filter(
        (r) => assignDecomposition(r) === "HTML_ALLOWLIST_GAP" && r.reprobeWouldWin
      ).length,
      effort: "LOW",
      serpCostDelta: "NEGATIVE (reduces SERP fallback calls)",
      risk: "LOW",
    },
    {
      fix: "SCHEMA allowlist expansion",
      affected: decompositionCounts.SCHEMA_ALLOWLIST_GAP,
      expectedRecovered: 0,
      effort: "LOW",
      serpCostDelta: "NEGATIVE",
      risk: "LOW",
    },
    {
      fix: "HTML scrape parser / candidate URL scoring",
      affected: decompositionCounts.PARSER_FAILURE,
      expectedRecovered: categoryA.filter(
        (r) => assignDecomposition(r) === "PARSER_FAILURE"
      ).length,
      effort: "HIGH",
      serpCostDelta: "NONE",
      risk: "MEDIUM",
    },
    {
      fix: "Chain ordering — skip unsupported primary before SERP",
      affected: decompositionCounts.CHAIN_ORDER_PROBLEM,
      expectedRecovered: categoryA.filter(
        (r) => assignDecomposition(r) === "CHAIN_ORDER_PROBLEM" && r.reprobeWouldWin
      ).length,
      effort: "LOW",
      serpCostDelta: "NONE",
      risk: "LOW",
    },
  ];

  const wave1Recovered = categoryA.filter((r) => {
    const d = assignDecomposition(r);
    return (
      (d === "QUERY_MISMATCH" || d === "HTML_ALLOWLIST_GAP") && r.reprobeWouldWin
    );
  }).length;
  const wave2Recovered = categoryA.filter((r) => {
    const d = assignDecomposition(r);
    return d === "IMAGE_EXTRACTION_FAILURE" && r.reprobeResultCount === 0;
  }).length;
  const wave3Recovered = categoryA.filter((r) => {
    const d = assignDecomposition(r);
    return d === "PARSER_FAILURE" || d === "UNKNOWN";
  }).length;

  const misclassified = executorAudit.filter(
    (e) => e.classification === "MISCLASSIFIED_TO_SERP"
  );
  const correctlyOnSerp = executorAudit.filter(
    (e) => e.classification === "CORRECTLY_ON_SERP"
  );

  const report = {
    generatedAt: new Date().toISOString(),
    phase: "9.4",
    inputArtifact: PHASE_93_ARTIFACT,
    categoryACount: categoryA.length,
    task1_decomposition: {
      counts: decompositionCounts,
      suppliers: decomposed,
    },
    task2_fixImpactModel: fixImpact,
    task3_higherTierExecutorAudit: {
      correctlyOnSerp: correctlyOnSerp.length,
      misclassifiedToSerp: misclassified.length,
      misclassifiedSuppliers: misclassified,
      correctlyOnSerpSuppliers: correctlyOnSerp.map((e) => e.supplierId),
    },
    task4_imageExtractionAnalysis: {
      summary: {
        suppliersWithSerpProbe: imageAnalysis.length,
        imageGateFailures: imageGated.length,
        organicButZeroExtracted: imageAnalysis.filter(
          (r) => r.organicSameDomainCount > 0 && r.agoraExtractedCount === 0
        ).length,
        failureModes: imageAnalysis.reduce(
          (acc, r) => {
            acc[r.failureMode] = (acc[r.failureMode] ?? 0) + 1;
            return acc;
          },
          {} as Record<string, number>
        ),
      },
      finding:
        "When organicSameDomainCount > 0 but agoraExtractedCount === 0, searchSupplierSite drops rows at the image gate (no thumbnail, page og:image, or Google image fallback). URL classification may also exclude links before image fetch.",
      suppliers: imageGated,
    },
    task5_queryStrategyAnalysis: {
      phase92GenericSupplies: categoryA.filter((r) => r.phase92Query === "supplies")
        .length,
      queryChangedOnReprobe: categoryA.filter((r) => r.queryChanged).length,
      reprobeWinsAfterQueryChange: queryWinFailures.length,
      stillFailedAfterBetterQuery: queryOnlyFailures.length,
      recommendation:
        "Use supplier primaryCategoryId / supplierId heuristics / legacy category profile for default search queries instead of strategy-wide 'supplies'.",
      estimatedImpact: {
        immediateRouterWins: queryWinFailures.filter((r) => r.reprobeWouldWin)
          .length,
        suppliersAffected: decompositionCounts.QUERY_MISMATCH,
      },
    },
    task6_creditEfficiency: {
      phase93CostDrivers: [
        "98 suppliers × (homepage fetch + optional SERP probe + full router chain reprobe)",
        "Double SERP call per SERP-primary supplier (probeSerp + searchSupplierSite in chain)",
      ],
      recommendations: [
        {
          strategy: "Cohort sampling",
          detail:
            "Validate fixes on 15-supplier representative sample (phase9.1 pattern) before full 120 re-audit",
        },
        {
          strategy: "Cached SERP reuse",
          detail:
            "Phase 9.3 probeSerp and executeExtractionStrategy share same query — use cachedSerpFetch (already in codebase) and avoid duplicate probe+chain SERP for audits",
        },
        {
          strategy: "Decomposition-first validation",
          detail:
            "After Wave 1 config/query fixes, re-run only Category A suppliers (~73) not full 120",
        },
        {
          strategy: "Offline image-gate replay",
          detail:
            "For IMAGE_EXTRACTION_FAILURE cohort, replay stored organic URLs through image resolution without new SerpAPI calls",
        },
        {
          strategy: "Allowlist-only verification",
          detail:
            "HTML allowlist expansion validated with 0 SERP calls — registry + parity script only",
        },
      ],
    },
    task7_recoveryWaves: {
      wave1: {
        name: "Zero/low-code: query defaults + HTML allowlist",
        fixes: ["Category-aware queries", "HTML_SCRAPE allowlist expansion"],
        suppliersAffected:
          decompositionCounts.QUERY_MISMATCH + decompositionCounts.HTML_ALLOWLIST_GAP,
        estimatedLift: wave1Recovered,
        effort: "1-2 days",
        risk: "LOW",
        serpCost: "NONE to NEGATIVE",
      },
      wave2: {
        name: "SERP image resolution pipeline",
        fixes: [
          "Improve og:image / page extractPageImageUrl success rate",
          "Tier Google image fallback before drop",
          "Category-page thumbnails as secondary source",
        ],
        suppliersAffected: decompositionCounts.IMAGE_EXTRACTION_FAILURE,
        estimatedLift: Math.min(wave2Recovered, 20),
        effort: "3-5 days",
        risk: "MEDIUM",
        serpCost: "LOW (page fetches only, no extra SerpAPI)",
      },
      wave3: {
        name: "HTML parser + unknown cohort",
        fixes: ["HTML candidate scoring", "re_michel-style parser fixes"],
        suppliersAffected:
          decompositionCounts.PARSER_FAILURE + decompositionCounts.UNKNOWN,
        estimatedLift: wave3Recovered,
        effort: "5-8 days",
        risk: "MEDIUM-HIGH",
        serpCost: "NONE",
      },
    },
    task8_projectedOutcomes: {
      currentRouterWinners: CURRENT_ROUTER_WINNERS,
      afterWave1: CURRENT_ROUTER_WINNERS + wave1Recovered,
      afterWave2: CURRENT_ROUTER_WINNERS + wave1Recovered + Math.min(wave2Recovered, 20),
      afterWave3:
        CURRENT_ROUTER_WINNERS +
        wave1Recovered +
        Math.min(wave2Recovered, 20) +
        Math.min(wave3Recovered, 8),
      liveCatalogSuppliers: {
        current: CURRENT_ROUTER_WINNERS,
        afterWave1: CURRENT_ROUTER_WINNERS + reprobeWins,
        note: "reprobeWouldWin from Phase 9.3 category-aware re-audit",
      },
      qualityNote:
        "Recovered SERP suppliers projected MEDIUM tier; HIGH requires platform/schema executors",
      categoryAReprobeBaseline: {
        reprobeWouldWin: reprobeWins,
        reprobeWithResults: reprobeResults,
      },
    },
    task9_implementationPlan: {
      fixFirst: [
        "Category-aware default queries (26 suppliers, 0 SERP cost)",
        "HTML allowlist expansion (9 suppliers, config-only)",
      ],
      doNotFix: [
        "Category B credential-blocked Bloomreach cohort (partnership required)",
        "Category C brochure sites with no indexed catalog",
        "Removing image requirement (investigate resolution instead)",
      ],
      configOnly: [
        "HTML_SCRAPE allowlist (9 suppliers)",
        "Audit script query defaults (phase9.2 STRATEGY_DEFAULT_QUERY)",
      ],
      codeChanges: [
        "SERP image resolution improvements",
        "HTML scrape candidate URL parser",
        "Optional: skip unsupported strategy attempt in chain telemetry",
      ],
      highestRoi: fixImpact.sort(
        (a, b) => b.expectedRecovered - a.expectedRecovered
      ),
      misclassifiedToSerp: misclassified.map((m) => m.supplierId),
    },
  };

  const outDir = join(process.cwd(), "scripts/output/fingerprint");
  await mkdir(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outPath = join(outDir, `phase9.4-category-a-recovery-${stamp}.json`);
  await writeFile(outPath, JSON.stringify(report, null, 2));

  console.log("\n=== Phase 9.4 Category A Recovery Strategy ===\n");
  console.log("Category A:", categoryA.length);
  console.log("Decomposition:", decompositionCounts);
  console.log("Executor audit:", {
    correctlyOnSerp: correctlyOnSerp.length,
    misclassifiedToSerp: misclassified.length,
  });
  console.log("Image gate failures:", imageGated.length);
  console.log("Projected winners:", report.task8_projectedOutcomes);
  console.log(`\nWrote ${outPath}\n`);

  await getPrisma().$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
