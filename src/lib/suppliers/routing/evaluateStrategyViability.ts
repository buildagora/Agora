import type { ExtractionStrategy } from "@prisma/client";
import type { SupplierFingerprintFacts } from "../fingerprint/types";
import type {
  ResolveExtractionStrategyInput,
  StrategyTier,
  StrategyViability,
} from "./types";
import { strategyTier } from "./types";

/**
 * Product-producing extraction strategies only (Phase 6A).
 * PLAYWRIGHT and ANTI_BOT_EVALUATION remain in Prisma enum but are excluded
 * from active routing plans.
 */
export const STRATEGY_PLAN_ORDER: ExtractionStrategy[] = [
  "PUBLIC_API",
  "PLATFORM_API",
  "SCHEMA_OR_SITEMAP",
  "HTML_SCRAPE",
  "SERP_PRODUCT_ENGINE",
  "SERP_SITE_ORGANIC",
  "PROBABILISTIC_CATEGORY_PROFILE",
];

/** @deprecated Deferred — not included in STRATEGY_PLAN_ORDER. */
export const DEFERRED_EXTRACTION_STRATEGIES: ExtractionStrategy[] = [
  "PLAYWRIGHT",
  "ANTI_BOT_EVALUATION",
];

const HTML_SCRAPE_ANTIBOT_OK = new Set(["LOW", "MEDIUM", "UNKNOWN"]);

function effectiveSnapshot(
  input: ResolveExtractionStrategyInput
): SupplierFingerprintFacts["legacySnapshot"] {
  return input.legacySnapshot ?? input.facts.legacySnapshot;
}

function effectiveDomain(input: ResolveExtractionStrategyInput): string | null {
  return input.canonicalDomain ?? input.facts.canonicalDomain;
}

function platformBindingNotRequired(
  facts: SupplierFingerprintFacts
): boolean {
  if (facts.detectedPlatform === "SLI") return true;
  if (
    facts.detectedPlatform === "HYBRIS" &&
    facts.legacySnapshot.mode === "hybris"
  ) {
    return true;
  }
  return false;
}

function confidenceFor(
  strategy: ExtractionStrategy,
  facts: SupplierFingerprintFacts
): number {
  switch (strategy) {
    case "PLATFORM_API":
      return facts.platformDetectionConfidence ?? 0.85;
    case "PUBLIC_API":
      return 0.85;
    case "SCHEMA_OR_SITEMAP":
      return facts.hasSchemaMarkup === true ? 0.85 : 0.8;
    case "HTML_SCRAPE":
      return facts.renderingType === "SERVER_RENDERED" ? 0.75 : 0.65;
    case "SERP_PRODUCT_ENGINE":
    case "SERP_SITE_ORGANIC":
      return 0.7;
    default:
      return 0.5;
  }
}

function primaryReasonFor(strategy: ExtractionStrategy): string {
  switch (strategy) {
    case "PUBLIC_API":
      return "public_api_accessible";
    case "PLATFORM_API":
      return "platform_api_accessible";
    case "SCHEMA_OR_SITEMAP":
      return "schema_or_sitemap_present";
    case "HTML_SCRAPE":
      return "server_rendered_html_viable";
    case "SERP_PRODUCT_ENGINE":
      return "legacy_product_engine_serp";
    case "SERP_SITE_ORGANIC":
      return "serp_site_organic_fallback";
    case "PROBABILISTIC_CATEGORY_PROFILE":
      return "capability_profile_fallback";
    default:
      return "strategy_selected";
  }
}

function evaluatePublicApi(
  facts: SupplierFingerprintFacts,
  trace: string[]
): Pick<StrategyViability, "viable" | "reason"> {
  if (facts.publicApiAccessStatus === "ACCESSIBLE") {
    trace.push("tier1.public:viable publicApiAccessStatus=ACCESSIBLE");
    return { viable: true, reason: "public_api_accessible" };
  }
  trace.push(`tier1.public:skip publicApiAccessStatus=${facts.publicApiAccessStatus}`);
  return { viable: false, reason: "public_api_not_accessible" };
}

function evaluatePlatformApi(
  facts: SupplierFingerprintFacts,
  trace: string[]
): Pick<StrategyViability, "viable" | "reason"> {
  if (facts.detectedPlatform === "UNKNOWN") {
    trace.push("tier1.platform:skip detectedPlatform=UNKNOWN");
    return { viable: false, reason: "platform_unknown" };
  }
  if (facts.platformAccessStatus !== "ACCESSIBLE") {
    trace.push(
      `tier1.platform:skip platformAccessStatus=${facts.platformAccessStatus}`
    );
    return { viable: false, reason: "platform_not_accessible" };
  }
  if (!facts.platformBindingValid && !platformBindingNotRequired(facts)) {
    trace.push("tier1.platform:skip platformBindingValid=false");
    return { viable: false, reason: "platform_binding_invalid" };
  }
  trace.push("tier1.platform:viable");
  return { viable: true, reason: "platform_api_accessible" };
}

function evaluateSchemaOrSitemap(
  facts: SupplierFingerprintFacts,
  trace: string[]
): Pick<StrategyViability, "viable" | "reason"> {
  if (facts.hasSchemaMarkup === true) {
    trace.push("tier2.schema:viable hasSchemaMarkup=true");
    return { viable: true, reason: "schema_markup_present" };
  }
  if (facts.hasSitemap === true) {
    trace.push("tier2.schema:viable hasSitemap=true");
    return { viable: true, reason: "sitemap_present" };
  }
  trace.push("tier2.schema:skip");
  return { viable: false, reason: "no_schema_or_sitemap" };
}

function evaluateHtmlScrape(
  facts: SupplierFingerprintFacts,
  trace: string[]
): Pick<StrategyViability, "viable" | "reason"> {
  const renderOk =
    facts.renderingType === "SERVER_RENDERED" ||
    facts.renderingType === "HYBRID";
  if (!renderOk) {
    trace.push(`tier2.html:skip renderingType=${facts.renderingType}`);
    return { viable: false, reason: "rendering_not_html_scrape_viable" };
  }
  if (!HTML_SCRAPE_ANTIBOT_OK.has(facts.antiBotRisk)) {
    trace.push(`tier2.html:skip antiBotRisk=${facts.antiBotRisk}`);
    return { viable: false, reason: "antibot_too_high_for_html_scrape" };
  }
  trace.push("tier2.html:viable");
  return { viable: true, reason: "server_rendered_html_viable" };
}

function evaluateSerpProductEngine(
  snapshot: SupplierFingerprintFacts["legacySnapshot"],
  facts: SupplierFingerprintFacts,
  trace: string[]
): Pick<StrategyViability, "viable" | "reason"> {
  if (snapshot.mode !== "product_engine") {
    trace.push("tier4.serp_engine:skip mode!=product_engine");
    return { viable: false, reason: "not_product_engine" };
  }
  if (!facts.allowSerpFallback) {
    trace.push("tier4.serp_engine:skip allowSerpFallback=false");
    return { viable: false, reason: "serp_fallback_disabled" };
  }
  trace.push("tier4.serp_engine:viable");
  return { viable: true, reason: "legacy_product_engine_serp" };
}

function evaluateSerpSiteOrganic(
  snapshot: SupplierFingerprintFacts["legacySnapshot"],
  domain: string | null,
  facts: SupplierFingerprintFacts,
  trace: string[]
): Pick<StrategyViability, "viable" | "reason"> {
  if (snapshot.mode === "product_engine") {
    trace.push("tier4.serp_organic:skip product_engine");
    return { viable: false, reason: "product_engine_supplier" };
  }
  if (!facts.allowSerpFallback) {
    trace.push("tier4.serp_organic:skip allowSerpFallback=false");
    return { viable: false, reason: "serp_fallback_disabled" };
  }
  if (!domain) {
    trace.push("tier4.serp_organic:skip no canonicalDomain");
    return { viable: false, reason: "no_canonical_domain" };
  }
  trace.push("tier4.serp_organic:viable");
  return { viable: true, reason: "serp_site_organic_fallback" };
}

function evaluateProbabilisticProfile(
  trace: string[]
): Pick<StrategyViability, "viable" | "reason"> {
  trace.push("tier5.profile:always_viable");
  return {
    viable: true,
    reason: "capability_profile_fallback",
  };
}

function evaluateStrategy(
  strategy: ExtractionStrategy,
  input: ResolveExtractionStrategyInput,
  snapshot: SupplierFingerprintFacts["legacySnapshot"],
  domain: string | null,
  trace: string[]
): StrategyViability {
  const { facts } = input;
  const tier = strategyTier(strategy);

  let result: Pick<StrategyViability, "viable" | "reason">;
  switch (strategy) {
    case "PUBLIC_API":
      result = evaluatePublicApi(facts, trace);
      break;
    case "PLATFORM_API":
      result = evaluatePlatformApi(facts, trace);
      break;
    case "SCHEMA_OR_SITEMAP":
      result = evaluateSchemaOrSitemap(facts, trace);
      break;
    case "HTML_SCRAPE":
      result = evaluateHtmlScrape(facts, trace);
      break;
    case "SERP_PRODUCT_ENGINE":
      result = evaluateSerpProductEngine(snapshot, facts, trace);
      break;
    case "SERP_SITE_ORGANIC":
      result = evaluateSerpSiteOrganic(snapshot, domain, facts, trace);
      break;
    case "PROBABILISTIC_CATEGORY_PROFILE":
      result = evaluateProbabilisticProfile(trace);
      break;
    default:
      result = { viable: false, reason: "strategy_not_in_active_plan" };
  }

  return {
    strategy,
    tier,
    ...result,
    confidence: result.viable ? confidenceFor(strategy, facts) : undefined,
  };
}

/**
 * Evaluate viability for every strategy in canonical order.
 */
export function evaluateAllStrategyViabilities(
  input: ResolveExtractionStrategyInput
): { viabilityByStrategy: StrategyViability[]; decisionTrace: string[] } {
  const snapshot = effectiveSnapshot(input);
  const domain = effectiveDomain(input);
  const decisionTrace: string[] = [];

  const viabilityByStrategy = STRATEGY_PLAN_ORDER.map((strategy) =>
    evaluateStrategy(strategy, input, snapshot, domain, decisionTrace)
  );

  return { viabilityByStrategy, decisionTrace };
}

export function primaryReasonForStrategy(strategy: ExtractionStrategy): string {
  return primaryReasonFor(strategy);
}

export { effectiveDomain, effectiveSnapshot };
