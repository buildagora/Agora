/**
 * Phase 9.3 — exhausted supplier root-cause audit (read-only truth discovery).
 *
 *   npm run fingerprint:phase9.3-audit
 *
 * Does NOT modify routing. Re-probes exhausted suppliers with category-aware queries,
 * direct SERP diagnostics, and lightweight website availability signals.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { readFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { getPrisma } from "../../src/lib/db.server";
import { getSerpApiKey } from "../../src/lib/config/env";
import { classifyAntiBotResponse } from "../../src/lib/suppliers/fingerprint/classifyAntiBotResponse";
import { loadSupplierFingerprintFacts } from "../../src/lib/suppliers/fingerprint/loadSupplierFingerprintFacts.server";
import { searchSupplierDiscoveryForSupplier } from "../../src/lib/suppliers/resolveSupplierDiscovery";
import { resolveExtractionStrategy } from "../../src/lib/suppliers/routing/resolveExtractionStrategy";
import { resolveSupplierProbeQuery } from "../../src/lib/suppliers/routing/resolveSupplierProbeQuery";
import { pickPrimaryCategoryId } from "../../src/lib/suppliers/categoryTaxonomy";
import {
  HTML_SCRAPE_ALLOWLIST,
  getHtmlScrapeUnsupportedReason,
} from "../../src/lib/suppliers/routing/resolveHtmlScrapeExecution";
import {
  SCHEMA_OR_SITEMAP_ALLOWLIST,
  getSchemaOrSitemapUnsupportedReason,
} from "../../src/lib/suppliers/routing/resolveSchemaOrSitemapExecution";
import type { SupplierExtractionRouteEvent } from "../../src/lib/suppliers/routing/routerTelemetry";
import { searchSupplierSite } from "../../src/lib/suppliers/searchSupplierSite";
import { ROUTER_PROMOTED_SUPPLIERS } from "./phase6bProvenCohortParity";

process.env.FINGERPRINT_ROUTER_ENABLED = "true";
process.env.FINGERPRINT_ROUTER_SHADOW = "true";
process.env.FINGERPRINT_ROUTER_EXECUTION_MODE = "promoted";
process.env.FINGERPRINT_ROUTER_PROMOTED_SUPPLIERS =
  ROUTER_PROMOTED_SUPPLIERS.join(",");
process.env.FINGERPRINT_ROUTER_SUPPLIER_ALLOWLIST =
  ROUTER_PROMOTED_SUPPLIERS.join(",");
process.env.FINGERPRINT_ROUTER_EXECUTION_TIMEOUT_MS = "45000";

const PHASE_92_ARTIFACT =
  "scripts/output/fingerprint/phase9.2-extraction-quality-audit-2026-06-06T20-24-25-924Z.json";

type DataAvailability = "DATA_AVAILABLE" | "DATA_PARTIALLY_AVAILABLE" | "DATA_NOT_AVAILABLE";
type RootCause =
  | "EXTRACTION_FAILURE"
  | "ACCESS_BLOCKED"
  | "CREDENTIAL_BLOCKED"
  | "ANTI_BOT_BLOCKED"
  | "CLOUDFLARE_BLOCKED"
  | "QUERY_MISMATCH"
  | "CONFIGURATION_GAP"
  | "DATA_NOT_AVAILABLE"
  | "UNKNOWN";
type OpportunityCategory = "A" | "B" | "C";

type Phase92Row = {
  supplierId: string;
  query: string;
  primaryStrategy: string;
  fallbackClass: string | null;
  chainExhausted: boolean;
  resultCount: number;
};

const capturedLogs: string[] = [];
const originalInfo = console.info.bind(console);
console.info = (...args: unknown[]) => {
  for (const arg of args) {
    if (typeof arg === "string") capturedLogs.push(arg);
  }
  originalInfo(...args);
};

function parseRouteEvent(since: number): SupplierExtractionRouteEvent | undefined {
  const events = capturedLogs
    .slice(since)
    .filter((line) => line.includes("supplier_extraction_route"))
    .map((line) => JSON.parse(line) as SupplierExtractionRouteEvent);
  return events[events.length - 1];
}

function inferAuditQuery(
  supplierId: string,
  primaryStrategy: string,
  primaryCategoryId?: string | null
): string {
  return resolveSupplierProbeQuery({
    supplierId,
    primaryStrategy,
    primaryCategoryId: primaryCategoryId as never,
  });
}

function isSameDomain(link: string, domain: string): boolean {
  try {
    const host = new URL(link).hostname.replace(/^www\./, "");
    const d = domain.replace(/^www\./, "");
    return host === d || host.endsWith(`.${d}`);
  } catch {
    return false;
  }
}

type SerpProbe = {
  apiOk: boolean;
  apiError: string | null;
  creditExhausted: boolean;
  organicRawCount: number;
  organicSameDomainCount: number;
  agoraExtractedCount: number;
};

async function probeSerp(
  domain: string,
  query: string,
  supplierId: string
): Promise<SerpProbe> {
  const empty: SerpProbe = {
    apiOk: false,
    apiError: null,
    creditExhausted: false,
    organicRawCount: 0,
    organicSameDomainCount: 0,
    agoraExtractedCount: 0,
  };
  let apiKey: string;
  try {
    apiKey = getSerpApiKey();
  } catch (err) {
    empty.apiError = err instanceof Error ? err.message : String(err);
    return empty;
  }

  const qParam = `site:${domain} ${query}`;
  const url = `https://serpapi.com/search.json?engine=google&q=${encodeURIComponent(qParam)}&api_key=${apiKey}`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
    const data = (await res.json()) as {
      error?: string;
      organic_results?: { link?: string }[];
    };
    if (data.error) {
      empty.apiError = data.error;
      empty.creditExhausted = /run out|quota|credit|limit/i.test(data.error);
      return empty;
    }
    empty.apiOk = true;
    const organicRaw = (data.organic_results || []).slice(0, 20);
    empty.organicRawCount = organicRaw.length;
    empty.organicSameDomainCount = organicRaw.filter(
      (item) => item.link && isSameDomain(item.link, domain)
    ).length;
  } catch (err) {
    empty.apiError = err instanceof Error ? err.message : String(err);
    return empty;
  }

  try {
    const extracted = await searchSupplierSite({
      query,
      domain,
      supplierIds: [supplierId],
      source: "GENERIC",
      logLabel: "Phase93",
    });
    empty.agoraExtractedCount = extracted.length;
  } catch {
    empty.agoraExtractedCount = 0;
  }

  return empty;
}

type WebsiteProbe = {
  homepageStatus: number | null;
  homepageBytes: number;
  antiBotCategory: string;
  productLinkCount: number;
  categoryLinkCount: number;
  hasJsonLdProduct: boolean;
  hasSearchForm: boolean;
  searchUrlStatus: number | null;
  searchPageProductSignals: number;
  evidence: string[];
};

const PRODUCT_PATH_RE =
  /\/(product|products|p\/|sku|item|shop|catalog|pd\/|detail)/i;
const CATEGORY_PATH_RE =
  /\/(category|categories|c\/|collection|department|browse)/i;

async function fetchPage(url: string): Promise<{
  status: number;
  body: string;
  antiBotCategory: string;
}> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(15000),
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; AgoraAuditBot/1.0; +https://agora.build)",
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
    });
    const body = await res.text();
    const classified = classifyAntiBotResponse({
      status: res.status,
      html: body,
      url,
    });
    return {
      status: res.status,
      body,
      antiBotCategory: classified.antiBotCategory,
    };
  } catch {
    return { status: 0, body: "", antiBotCategory: "FETCH_FAILED" };
  }
}

function countPatternLinks(html: string, baseUrl: string, re: RegExp): number {
  const hrefRe = /href=["']([^"']+)["']/gi;
  let count = 0;
  let m: RegExpExecArray | null;
  while ((m = hrefRe.exec(html)) !== null) {
    try {
      const href = m[1];
      const abs = href.startsWith("http") ? href : new URL(href, baseUrl).href;
      if (re.test(abs)) count += 1;
    } catch {
      /* skip */
    }
  }
  return count;
}

async function probeWebsite(domain: string, query: string): Promise<WebsiteProbe> {
  const homepageUrl = `https://${domain.replace(/^www\./, "")}/`;
  const evidence: string[] = [];
  const home = await fetchPage(homepageUrl);

  const productLinkCount = countPatternLinks(home.body, homepageUrl, PRODUCT_PATH_RE);
  const categoryLinkCount = countPatternLinks(home.body, homepageUrl, CATEGORY_PATH_RE);
  const hasJsonLdProduct = /"@type"\s*:\s*"Product"/i.test(home.body);
  const hasSearchForm = /type=["']search["']|name=["']q["']|\/search\?/i.test(home.body);

  if (home.status === 200 && home.body.length > 500) {
    evidence.push(`homepage HTTP ${home.status}, ${home.body.length} bytes`);
  } else if (home.status > 0) {
    evidence.push(`homepage HTTP ${home.status}, ${home.body.length} bytes`);
  } else {
    evidence.push("homepage fetch failed");
  }
  if (productLinkCount > 0) evidence.push(`${productLinkCount} product-path links on homepage`);
  if (categoryLinkCount > 0) evidence.push(`${categoryLinkCount} category-path links on homepage`);
  if (hasJsonLdProduct) evidence.push("JSON-LD Product on homepage");
  if (hasSearchForm) evidence.push("search form or /search link on homepage");

  const searchUrls = [
    `https://${domain}/search?q=${encodeURIComponent(query)}`,
    `https://${domain}/search?search=${encodeURIComponent(query)}`,
    `https://www.${domain}/search?q=${encodeURIComponent(query)}`,
  ];

  let searchUrlStatus: number | null = null;
  let searchPageProductSignals = 0;
  for (const searchUrl of searchUrls) {
    const search = await fetchPage(searchUrl);
    if (search.status === 200 && search.body.length > 200) {
      searchUrlStatus = search.status;
      searchPageProductSignals = countPatternLinks(search.body, searchUrl, PRODUCT_PATH_RE);
      if (searchPageProductSignals > 0) {
        evidence.push(`search page ${searchUrl} has ${searchPageProductSignals} product links`);
      }
      break;
    }
    searchUrlStatus = search.status || searchUrlStatus;
  }

  return {
    homepageStatus: home.status || null,
    homepageBytes: home.body.length,
    antiBotCategory: home.antiBotCategory,
    productLinkCount,
    categoryLinkCount,
    hasJsonLdProduct,
    hasSearchForm,
    searchUrlStatus,
    searchPageProductSignals,
    evidence,
  };
}

function classifyDataAvailability(input: {
  website: WebsiteProbe;
  serp?: SerpProbe;
}): DataAvailability {
  const { website, serp } = input;
  const strongSignals =
    website.productLinkCount >= 3 ||
    website.searchPageProductSignals >= 2 ||
    website.hasJsonLdProduct ||
    (serp?.organicSameDomainCount ?? 0) >= 3;
  if (strongSignals) return "DATA_AVAILABLE";

  const partialSignals =
    website.productLinkCount > 0 ||
    website.categoryLinkCount >= 2 ||
    website.searchPageProductSignals > 0 ||
    website.hasSearchForm ||
    (serp?.organicSameDomainCount ?? 0) > 0;
  if (partialSignals) return "DATA_PARTIALLY_AVAILABLE";

  if (
    website.antiBotCategory === "CLOUDFLARE_CHALLENGE" ||
    website.antiBotCategory === "CLOUDFLARE_HARD_BLOCK" ||
    website.homepageBytes === 0
  ) {
    return "DATA_PARTIALLY_AVAILABLE";
  }

  return "DATA_NOT_AVAILABLE";
}

function classifyRootCause(input: {
  supplierId: string;
  primaryStrategy: string;
  phase92: Phase92Row;
  route?: SupplierExtractionRouteEvent;
  reprobeResultCount: number;
  auditQuery: string;
  website: WebsiteProbe;
  serp?: SerpProbe;
  dataAvailability: DataAvailability;
}): RootCause {
  const { supplierId, primaryStrategy, phase92, route, reprobeResultCount, auditQuery, website, serp, dataAvailability } =
    input;
  const attempts = route?.attemptedStrategies ?? [];

  if (primaryStrategy === "HTML_SCRAPE" && getHtmlScrapeUnsupportedReason(supplierId)) {
    return "CONFIGURATION_GAP";
  }
  if (primaryStrategy === "SCHEMA_OR_SITEMAP") {
    const factsReason = getSchemaOrSitemapUnsupportedReason(supplierId, {
      supplierId,
      canonicalDomain: null,
      sitemapUrls: [],
    } as never);
    if (factsReason === "supplier_not_allowlisted") return "CONFIGURATION_GAP";
  }
  if (attempts.some((a) => a.reason === "supplier_not_allowlisted")) {
    return "CONFIGURATION_GAP";
  }

  if (
    phase92.fallbackClass === "PLATFORM_ACCESS_BLOCKED" ||
    attempts.some((a) => a.reason === "platform_access_not_allowed")
  ) {
    return "CREDENTIAL_BLOCKED";
  }

  if (
    website.antiBotCategory === "CLOUDFLARE_CHALLENGE" ||
    website.antiBotCategory === "CLOUDFLARE_HARD_BLOCK" ||
    attempts.some((a) => a.antiBotCategory === "CLOUDFLARE_CHALLENGE")
  ) {
    return "CLOUDFLARE_BLOCKED";
  }

  if (
    website.antiBotCategory === "HTTP_403" ||
    website.antiBotCategory === "CAPTCHA_WIDGET" ||
    attempts.some((a) => (a.productPagesBlocked ?? 0) > 0 || (a.pagesBlocked ?? 0) > 0)
  ) {
    return "ANTI_BOT_BLOCKED";
  }

  if (
    reprobeResultCount > 0 &&
    phase92.resultCount === 0 &&
    phase92.query !== auditQuery &&
    (phase92.query === "supplies" || phase92.query.length < 4)
  ) {
    return "QUERY_MISMATCH";
  }

  if (serp && serp.organicSameDomainCount > 0 && serp.agoraExtractedCount === 0 && reprobeResultCount === 0) {
    return "EXTRACTION_FAILURE";
  }

  const schemaAttempt = attempts.find((a) => a.strategy === "SCHEMA_OR_SITEMAP");
  if (
    schemaAttempt &&
    schemaAttempt.status === "empty" &&
    (schemaAttempt.discoveryUrlCount ?? 0) > 0 &&
    dataAvailability !== "DATA_NOT_AVAILABLE"
  ) {
    return "EXTRACTION_FAILURE";
  }

  if (
    dataAvailability !== "DATA_NOT_AVAILABLE" &&
    reprobeResultCount === 0 &&
    (website.homepageStatus === 403 || website.homepageStatus === 401)
  ) {
    return "ACCESS_BLOCKED";
  }

  if (dataAvailability === "DATA_NOT_AVAILABLE") {
    return "DATA_NOT_AVAILABLE";
  }

  if (reprobeResultCount > 0) return "UNKNOWN";

  if (serp && serp.organicSameDomainCount === 0 && dataAvailability === "DATA_AVAILABLE") {
    return "QUERY_MISMATCH";
  }

  return "UNKNOWN";
}

function toOpportunityCategory(
  rootCause: RootCause,
  dataAvailability: DataAvailability
): OpportunityCategory {
  if (dataAvailability === "DATA_NOT_AVAILABLE" || rootCause === "DATA_NOT_AVAILABLE") {
    return "C";
  }
  if (
    rootCause === "ACCESS_BLOCKED" ||
    rootCause === "CREDENTIAL_BLOCKED" ||
    rootCause === "ANTI_BOT_BLOCKED" ||
    rootCause === "CLOUDFLARE_BLOCKED"
  ) {
    return "B";
  }
  if (
    rootCause === "EXTRACTION_FAILURE" ||
    rootCause === "QUERY_MISMATCH" ||
    rootCause === "CONFIGURATION_GAP"
  ) {
    return "A";
  }
  return dataAvailability === "DATA_AVAILABLE" ? "A" : "C";
}

function projectQualityIfFixed(
  reprobeResultCount: number,
  rootCause: RootCause
): "HIGH" | "MEDIUM" | "LOW" | null {
  if (rootCause === "CONFIGURATION_GAP" || rootCause === "QUERY_MISMATCH") {
    return reprobeResultCount >= 5 ? "MEDIUM" : reprobeResultCount > 0 ? "MEDIUM" : "LOW";
  }
  if (rootCause === "EXTRACTION_FAILURE") return "MEDIUM";
  return reprobeResultCount >= 8 ? "HIGH" : reprobeResultCount >= 3 ? "MEDIUM" : null;
}

const SPOT_CHECK_IDS = [
  "absolute_glass",
  "grainger_hsv",
  "84_lumber_mad",
  "lansing_hsv",
  "east_coast_metal_hsv",
  "shearer_supply_hsv",
  "city_electric_hsv",
  "re_michel_hsv",
  "capitol_materials_hsv",
  "wilson_lumber_hsv",
];

async function main() {
  const phase92Raw = await readFile(PHASE_92_ARTIFACT, "utf8");
  const phase92 = JSON.parse(phase92Raw) as {
    supplierAudits: Phase92Row[];
  };
  const exhausted = phase92.supplierAudits.filter((r) => r.chainExhausted);

  console.log(`\n=== Phase 9.3 Exhausted Root Cause Audit ===\n`);
  console.log(`Loaded ${exhausted.length} chain-exhausted suppliers from Phase 9.2\n`);

  let serpApiHealth: { ok: boolean; error: string | null; creditExhausted: boolean } = {
    ok: false,
    error: null,
    creditExhausted: false,
  };
  try {
    const key = getSerpApiKey();
    const testUrl = `https://serpapi.com/search.json?engine=google&q=${encodeURIComponent("site:grainger.com gloves")}&api_key=${key}`;
    const res = await fetch(testUrl, { signal: AbortSignal.timeout(15000) });
    const data = (await res.json()) as { error?: string; organic_results?: unknown[] };
    if (data.error) {
      serpApiHealth = {
        ok: false,
        error: data.error,
        creditExhausted: /run out|quota|credit|limit/i.test(data.error),
      };
    } else {
      serpApiHealth = { ok: true, error: null, creditExhausted: false };
    }
  } catch (err) {
    serpApiHealth.error = err instanceof Error ? err.message : String(err);
  }

  const inventory: Record<string, unknown>[] = [];
  const serpCohort: Record<string, unknown>[] = [];

  const prisma = getPrisma();
  const categoryBySupplier = new Map<string, string>();
  const supplierRows = await prisma.supplier.findMany({
    where: { id: { in: exhausted.map((r) => r.supplierId) } },
    select: {
      id: true,
      category: true,
      primaryCategoryId: true,
      categoryLinks: { select: { categoryId: true } },
    },
  });
  for (const row of supplierRows) {
    categoryBySupplier.set(
      row.id,
      pickPrimaryCategoryId({
        supplierId: row.id,
        linkCategoryIds: row.categoryLinks.map((l) => l.categoryId),
        legacyCategory: row.category,
      })
    );
  }

  for (let i = 0; i < exhausted.length; i++) {
    const phase92Row = exhausted[i];
    const { supplierId, primaryStrategy: plannedStrategy, fallbackClass: fallbackReason } =
      phase92Row;

    const facts = await loadSupplierFingerprintFacts(supplierId);
    const domain = facts?.canonicalDomain ?? null;
    const auditQuery = inferAuditQuery(
      supplierId,
      plannedStrategy,
      categoryBySupplier.get(supplierId)
    );

    let website: WebsiteProbe | null = null;
    let serp: SerpProbe | undefined;
    if (domain) {
      website = await probeWebsite(domain, auditQuery);
      if (plannedStrategy === "SERP_SITE_ORGANIC" || plannedStrategy === "SERP_PRODUCT_ENGINE") {
        serp = await probeSerp(domain, auditQuery, supplierId);
      }
    }

    const since = capturedLogs.length;
    const reprobeResults = domain
      ? await searchSupplierDiscoveryForSupplier(supplierId, auditQuery, domain, {
          entryPoint: "search_stage2",
        })
      : [];
    const route = parseRouteEvent(since);

    const dataAvailability = classifyDataAvailability({
      website: website ?? {
        homepageStatus: null,
        homepageBytes: 0,
        antiBotCategory: "FETCH_FAILED",
        productLinkCount: 0,
        categoryLinkCount: 0,
        hasJsonLdProduct: false,
        hasSearchForm: false,
        searchUrlStatus: null,
        searchPageProductSignals: 0,
        evidence: ["no domain"],
      },
      serp,
    });

    const rootCause = classifyRootCause({
      supplierId,
      primaryStrategy: plannedStrategy,
      phase92: phase92Row,
      route,
      reprobeResultCount: reprobeResults.length,
      auditQuery,
      website: website ?? {
        homepageStatus: null,
        homepageBytes: 0,
        antiBotCategory: "FETCH_FAILED",
        productLinkCount: 0,
        categoryLinkCount: 0,
        hasJsonLdProduct: false,
        hasSearchForm: false,
        searchUrlStatus: null,
        searchPageProductSignals: 0,
        evidence: [],
      },
      serp,
      dataAvailability,
    });

    const opportunityCategory = toOpportunityCategory(rootCause, dataAvailability);
    const projectedTier = opportunityCategory === "A" ? projectQualityIfFixed(reprobeResults.length, rootCause) : null;

    const row = {
      supplierId,
      domain,
      plannedStrategy,
      fallbackReason,
      phase92Query: phase92Row.query,
      auditQuery,
      queryChanged: phase92Row.query !== auditQuery,
      dataAvailability,
      dataEvidence: website?.evidence ?? [],
      rootCause,
      opportunityCategory,
      reprobeResultCount: reprobeResults.length,
      reprobeChainExhausted: route?.chainExhausted ?? true,
      reprobeWouldWin: reprobeResults.length > 0 && !route?.chainExhausted,
      projectedTierIfFixed: projectedTier,
      websiteProbe: website,
      serpProbe: serp,
      attemptedStrategies: route?.attemptedStrategies,
      htmlAllowlisted: HTML_SCRAPE_ALLOWLIST.has(supplierId),
      schemaAllowlisted: SCHEMA_OR_SITEMAP_ALLOWLIST.has(supplierId),
    };

    inventory.push(row);

    if (plannedStrategy === "SERP_SITE_ORGANIC") {
      serpCohort.push({
        supplierId,
        domain,
        phase92Query: phase92Row.query,
        auditQuery,
        serpResultsReturned: (serp?.organicSameDomainCount ?? 0) > 0,
        serpResultsEmpty: (serp?.organicSameDomainCount ?? 0) === 0,
        serpCreditExhausted: serp?.creditExhausted ?? false,
        serpApiError: serp?.apiError ?? null,
        agoraExtractedCount: serp?.agoraExtractedCount ?? 0,
        queryMismatchSuspected:
          rootCause === "QUERY_MISMATCH" ||
          (phase92Row.query === "supplies" && auditQuery !== "supplies"),
        reprobeResultCount: reprobeResults.length,
        rootCause,
      });
    }

    if ((i + 1) % 10 === 0) {
      console.log(`  ... ${i + 1}/${exhausted.length}`);
    }
  }

  const rootCauseCounts: Record<string, number> = {};
  const categoryCounts = { A: 0, B: 0, C: 0 };
  const dataAvailCounts: Record<string, number> = {};
  let allowlistHtmlFailures = 0;
  let allowlistSchemaFailures = 0;

  for (const row of inventory) {
    const r = row as {
      rootCause: RootCause;
      opportunityCategory: string;
      dataAvailability: string;
      plannedStrategy: string;
    };
    rootCauseCounts[r.rootCause] = (rootCauseCounts[r.rootCause] ?? 0) + 1;
    categoryCounts[r.opportunityCategory as OpportunityCategory] += 1;
    dataAvailCounts[r.dataAvailability] = (dataAvailCounts[r.dataAvailability] ?? 0) + 1;
    if (r.plannedStrategy === "HTML_SCRAPE" && r.rootCause === "CONFIGURATION_GAP") allowlistHtmlFailures += 1;
    if (r.plannedStrategy === "SCHEMA_OR_SITEMAP" && r.rootCause === "CONFIGURATION_GAP") allowlistSchemaFailures += 1;
  }

  const categoryA = inventory.filter((r) => (r as { opportunityCategory: string }).opportunityCategory === "A");
  const businessImpact = {
    categoryAFixedHigh: categoryA.filter((r) => (r as { projectedTierIfFixed: string }).projectedTierIfFixed === "HIGH").length,
    categoryAFixedMedium: categoryA.filter((r) => (r as { projectedTierIfFixed: string }).projectedTierIfFixed === "MEDIUM").length,
    categoryAFixedLiveCatalog: categoryA.filter((r) => (r as { reprobeWouldWin: boolean }).reprobeWouldWin).length,
    categoryAAlreadyWinsOnReprobe: categoryA.filter((r) => (r as { reprobeResultCount: number }).reprobeResultCount > 0).length,
  };

  const serpSummary = {
    cohortSize: serpCohort.length,
    serpResultsReturned: serpCohort.filter((r) => (r as { serpResultsReturned: boolean }).serpResultsReturned).length,
    serpResultsEmpty: serpCohort.filter((r) => (r as { serpResultsEmpty: boolean }).serpResultsEmpty).length,
    queryMismatchSuspected: serpCohort.filter((r) => (r as { queryMismatchSuspected: boolean }).queryMismatchSuspected).length,
    extractionFailureSuspected: serpCohort.filter((r) => (r as { rootCause: string }).rootCause === "EXTRACTION_FAILURE").length,
    reprobeWinsAfterBetterQuery: serpCohort.filter((r) => (r as { reprobeResultCount: number }).reprobeResultCount > 0).length,
    globalSerpApiHealth: serpApiHealth,
  };

  const spotChecks = inventory
    .filter((r) => SPOT_CHECK_IDS.includes((r as { supplierId: string }).supplierId))
    .map((r) => {
      const row = r as {
        supplierId: string;
        domain: string | null;
        plannedStrategy: string;
        phase92Query: string;
        auditQuery: string;
        reprobeResultCount: number;
        rootCause: RootCause;
        dataAvailability: DataAvailability;
        dataEvidence: string[];
        websiteProbe: WebsiteProbe | null;
        serpProbe?: SerpProbe;
      };
      const couldExtract =
        row.reprobeResultCount > 0 ||
        (row.serpProbe?.organicSameDomainCount ?? 0) > 0 ||
        (row.websiteProbe?.productLinkCount ?? 0) > 0;
      return {
        supplierId: row.supplierId,
        domain: row.domain,
        strategy: row.plannedStrategy,
        phase92Outcome: "chain exhausted, 0 results",
        phase93Outcome: `${row.reprobeResultCount} results, rootCause=${row.rootCause}`,
        dataAvailability: row.dataAvailability,
        evidence: row.dataEvidence,
        couldAgoraReasonablyExtract: couldExtract,
        verdict:
          row.reprobeResultCount > 0
            ? "YES — reprobe with better query succeeded"
            : row.rootCause === "CONFIGURATION_GAP"
              ? "YES — allowlist/config fix needed"
              : row.rootCause === "EXTRACTION_FAILURE" || row.rootCause === "QUERY_MISMATCH"
                ? "LIKELY YES — data visible, pipeline failed"
                : row.rootCause === "CREDENTIAL_BLOCKED" || row.rootCause === "CLOUDFLARE_BLOCKED"
                  ? "NO — blocked access"
                  : "UNCERTAIN",
      };
    });

  const ourFault = inventory.filter((r) => {
    const c = (r as { opportunityCategory: string }).opportunityCategory;
    return c === "A";
  }).length;

  const supplierLimitation = categoryCounts.B + categoryCounts.C;

  const report = {
    generatedAt: new Date().toISOString(),
    phase: "9.3",
    inputArtifact: PHASE_92_ARTIFACT,
    exhaustedCount: exhausted.length,
    serpApiHealth,
    task1_inventory: inventory.map((r) => {
      const row = r as {
        supplierId: string;
        domain: string | null;
        plannedStrategy: string;
        fallbackReason: string | null;
      };
      return {
        supplierId: row.supplierId,
        domain: row.domain,
        plannedStrategy: row.plannedStrategy,
        fallbackReason: row.fallbackReason,
      };
    }),
    task2_dataAvailability: inventory.map((r) => {
      const row = r as {
        supplierId: string;
        dataAvailability: DataAvailability;
        dataEvidence: string[];
      };
      return {
        supplierId: row.supplierId,
        dataAvailability: row.dataAvailability,
        evidence: row.dataEvidence,
      };
    }),
    task3_rootCause: inventory.map((r) => {
      const row = r as { supplierId: string; rootCause: RootCause };
      return { supplierId: row.supplierId, rootCause: row.rootCause };
    }),
    rootCauseCounts,
    task4_serpCohort: { summary: serpSummary, suppliers: serpCohort },
    task5_allowlistGaps: {
      htmlScrapeAllowlistSize: HTML_SCRAPE_ALLOWLIST.size,
      schemaAllowlistSize: SCHEMA_OR_SITEMAP_ALLOWLIST.size,
      htmlConfigurationFailures: allowlistHtmlFailures,
      schemaConfigurationFailures: allowlistSchemaFailures,
      htmlNotAllowlistedSuppliers: inventory
        .filter(
          (r) =>
            (r as { plannedStrategy: string }).plannedStrategy === "HTML_SCRAPE" &&
            (r as { rootCause: string }).rootCause === "CONFIGURATION_GAP"
        )
        .map((r) => (r as { supplierId: string }).supplierId),
    },
    task6_spotChecks: spotChecks,
    task7_categoryABC: {
      counts: categoryCounts,
      categoryA_suppliers: categoryA.map((r) => (r as { supplierId: string }).supplierId),
      categoryB_suppliers: inventory
        .filter((r) => (r as { opportunityCategory: string }).opportunityCategory === "B")
        .map((r) => (r as { supplierId: string }).supplierId),
      categoryC_suppliers: inventory
        .filter((r) => (r as { opportunityCategory: string }).opportunityCategory === "C")
        .map((r) => (r as { supplierId: string }).supplierId),
    },
    task8_businessImpact: businessImpact,
    dataAvailabilityCounts: dataAvailCounts,
    task9_optimizationPriorities: [
      {
        rank: 1,
        focus: "Query mismatch + SERP image-gate extraction failures",
        roi: "HIGH",
        affected: rootCauseCounts.QUERY_MISMATCH + rootCauseCounts.EXTRACTION_FAILURE,
        rationale: "Largest Category A bucket; reprobe shows latent wins without partnership",
      },
      {
        rank: 2,
        focus: "HTML/SCHEMA allowlist configuration gaps",
        roi: "HIGH",
        affected: rootCauseCounts.CONFIGURATION_GAP,
        rationale: "Zero-code registry expansion unlocks planned strategies",
      },
      {
        rank: 3,
        focus: "Cloudflare / anti-bot blocked suppliers",
        roi: "MEDIUM",
        affected:
          rootCauseCounts.CLOUDFLARE_BLOCKED +
          rootCauseCounts.ANTI_BOT_BLOCKED +
          rootCauseCounts.ACCESS_BLOCKED,
        rationale: "Data exists but needs browser/proxy path",
      },
      {
        rank: 4,
        focus: "Credential-blocked platform suppliers",
        roi: "LOW",
        affected: rootCauseCounts.CREDENTIAL_BLOCKED,
        rationale: "Partnership-required Bloomreach cohort",
      },
      {
        rank: 5,
        focus: "Truly unavailable suppliers",
        roi: "LOW",
        affected: rootCauseCounts.DATA_NOT_AVAILABLE,
        rationale: "Brochure/service sites with no catalog",
      },
    ],
    task10_finalRecommendation: {
      ourFaultCount: ourFault,
      ourFaultPct: Math.round((ourFault / exhausted.length) * 100),
      supplierLimitationCount: supplierLimitation,
      exhaustionInflatedBySerpIssues:
        serpSummary.queryMismatchSuspected > 20 || serpSummary.reprobeWinsAfterBetterQuery > 15,
      serpInflationEvidence: {
        queryMismatchSuspected: serpSummary.queryMismatchSuspected,
        reprobeWinsAfterBetterQuery: serpSummary.reprobeWinsAfterBetterQuery,
        serpApiCreditExhausted: serpApiHealth.creditExhausted,
      },
      extractableDataAvailableToday:
        categoryCounts.A +
        inventory.filter(
          (r) =>
            (r as { dataAvailability: string }).dataAvailability === "DATA_AVAILABLE" &&
            (r as { opportunityCategory: string }).opportunityCategory === "B"
        ).length,
      highestLeverageImprovements: [
        "Replace generic 'supplies' probe queries with category-aware defaults",
        "Relax or tier SERP image requirement so organic product URLs surface",
        "Expand HTML_SCRAPE allowlist for lumber cohort",
        "Browser extraction path for Cloudflare-soft-block schema suppliers",
      ],
      uiStorefrontReady:
        businessImpact.categoryAFixedLiveCatalog + 22 >= 35
          ? "PARTIAL — golden cohort plus Category A fixes"
          : "NOT YET — fix Category A SERP/query issues first",
    },
    fullSupplierDiagnostics: inventory,
  };

  const outDir = join(process.cwd(), "scripts/output/fingerprint");
  await mkdir(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outPath = join(outDir, `phase9.3-root-cause-audit-${stamp}.json`);
  await writeFile(outPath, JSON.stringify(report, null, 2));

  console.log("\n=== Summary ===");
  console.log(`Exhausted: ${exhausted.length}`);
  console.log(`Category A (our fix): ${categoryCounts.A}`);
  console.log(`Category B (blocked): ${categoryCounts.B}`);
  console.log(`Category C (no data): ${categoryCounts.C}`);
  console.log(`Root causes:`, rootCauseCounts);
  console.log(`SERP API health:`, serpApiHealth);
  console.log(`SERP reprobe wins: ${serpSummary.reprobeWinsAfterBetterQuery}/${serpSummary.cohortSize}`);
  console.log(`\nWrote ${outPath}\n`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
