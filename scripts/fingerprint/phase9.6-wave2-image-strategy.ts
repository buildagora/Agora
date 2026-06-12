/**
 * Phase 9.6 — Wave 2 image resolution strategy (analysis only, no fixes).
 *
 *   npm run fingerprint:phase9.6-strategy
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { readFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { classifyUrl } from "../../src/lib/search/classification/classifyUrl";
import { getSerpCacheStats, serpCacheKey, cachedSerpFetch } from "../../src/lib/serpCache/server";
import { existsSync, readFileSync } from "node:fs";
import { getSerpApiKey } from "../../src/lib/config/env";
import { classifyAntiBotResponse } from "../../src/lib/suppliers/fingerprint/classifyAntiBotResponse";
import { resolveSupplierProbeQuery } from "../../src/lib/suppliers/routing/resolveSupplierProbeQuery";
import { pickPrimaryCategoryId } from "../../src/lib/suppliers/categoryTaxonomy";
import { getPrisma } from "../../src/lib/db.server";

const PHASE_94 = "scripts/output/fingerprint/phase9.4-category-a-recovery-2026-06-10T14-27-22-515Z.json";
const PHASE_93 = "scripts/output/fingerprint/phase9.3-root-cause-audit-2026-06-06T21-17-58-834Z.json";
const CACHE_DIR = join(process.cwd(), "scripts/cache/serpapi");

type ImageFailureStage =
  | "url_excluded_by_classification"
  | "serp_organic_thumbnail_missing"
  | "inline_image_matching_failed"
  | "shopping_image_matching_failed"
  | "page_fetch_blocked"
  | "page_og_image_missing"
  | "json_ld_image_missing"
  | "google_image_fallback_missing"
  | "all_stages_exhausted"
  | "unknown";

type PageImageAvailability =
  | "IMAGE_AVAILABLE_ON_SUPPLIER_PAGE"
  | "IMAGE_NOT_AVAILABLE_ON_SUPPLIER_PAGE"
  | "IMAGE_BLOCKED"
  | "UNKNOWN";

const HTML_FAILURES = ["acme_brick_madison", "esc_supply_hsv", "winsupply_hsv"] as const;
const LOWES_VARIANTS = [
  "lowes_hsv",
  "lowes_madison",
  "lowes_madison_hsv",
  "lowes_north_hsv",
  "lowes_south_hsv",
] as const;

function isSameDomain(url: string, domain: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    const d = domain.replace(/^www\./, "");
    return host === d || host.endsWith(`.${d}`);
  } catch {
    return false;
  }
}

function readCachedSerp(url: string): Record<string, unknown> | null {
  const path = join(CACHE_DIR, `${serpCacheKey(url)}.json`);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function extractMeta(html: string, attr: "property" | "name", val: string): string | null {
  const esc = val.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re1 = new RegExp(
    `<meta\\s[^>]*${attr}=["']${esc}["'][^>]*content=["']([^"']+)["']`,
    "i"
  );
  const m1 = html.match(re1);
  if (m1?.[1]) return m1[1];
  const re2 = new RegExp(
    `<meta\\s[^>]*content=["']([^"']+)["'][^>]*${attr}=["']${esc}["']`,
    "i"
  );
  const m2 = html.match(re2);
  return m2?.[1] ?? null;
}

function extractJsonLdProductImages(html: string): string[] {
  const images: string[] = [];
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    try {
      const data = JSON.parse(m[1]) as unknown;
      const nodes = Array.isArray(data) ? data : [data];
      for (const node of nodes) {
        if (!node || typeof node !== "object") continue;
        const n = node as { "@type"?: string; image?: string | string[] | { url?: string } };
        const t = n["@type"];
        if (t !== "Product" && t !== "ProductGroup") continue;
        const img = n.image;
        if (typeof img === "string") images.push(img);
        else if (Array.isArray(img)) {
          for (const i of img) {
            if (typeof i === "string") images.push(i);
            else if (i && typeof i === "object" && i.url) images.push(i.url);
          }
        } else if (img && typeof img === "object" && "url" in img && img.url) {
          images.push(img.url);
        }
      }
    } catch {
      /* skip */
    }
  }
  return images;
}

function countProductImagesInDom(html: string): number {
  const imgTags = html.match(/<img[^>]+>/gi) ?? [];
  let count = 0;
  for (const tag of imgTags) {
    if (/product|sku|item|catalog|thumbnail/i.test(tag)) count += 1;
    else if (/src=["'][^"']+["']/i.test(tag) && !/logo|icon|sprite|banner|avatar/i.test(tag)) {
      count += 1;
    }
  }
  return count;
}

async function fetchPage(url: string): Promise<{ status: number; html: string }> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(15000),
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
    });
    return { status: res.status, html: await res.text() };
  } catch {
    return { status: 0, html: "" };
  }
}

function diagnoseUrl(input: {
  link: string;
  title: string;
  thumbnail?: string;
  domain: string;
  pageStatus: number;
  pageHtml: string;
}): { stage: ImageFailureStage; signals: Record<string, boolean> } {
  const resultType = classifyUrl(input.link);
  const excluded =
    resultType === "BLOG_PAGE" ||
    resultType === "DOCUMENTATION_PAGE" ||
    resultType === "UNKNOWN";
  if (excluded) {
    return {
      stage: "url_excluded_by_classification",
      signals: { excluded: true, resultType: true } as never,
    };
  }

  const signals = {
    hasThumbnail: Boolean(input.thumbnail),
    hasOgImage: Boolean(extractMeta(input.pageHtml, "property", "og:image")),
    hasTwitterImage: Boolean(extractMeta(input.pageHtml, "name", "twitter:image")),
    hasJsonLdImage: extractJsonLdProductImages(input.pageHtml).length > 0,
    pageBlocked: input.pageStatus === 403 || input.pageStatus === 401,
    pageEmpty: input.pageHtml.length < 200,
  };

  if (input.thumbnail) {
    return { stage: "unknown", signals }; // should not fail if thumbnail present
  }
  if (signals.pageBlocked) {
    return { stage: "page_fetch_blocked", signals };
  }
  if (signals.hasJsonLdImage) {
    return { stage: "json_ld_image_missing", signals }; // available but not extracted
  }
  if (signals.hasOgImage || signals.hasTwitterImage) {
    return { stage: "page_og_image_missing", signals }; // available but not extracted
  }
  if (signals.pageEmpty) {
    return { stage: "page_fetch_blocked", signals };
  }
  return { stage: "all_stages_exhausted", signals };
}

function classifyPageAvailability(input: {
  pageStatus: number;
  html: string;
  antiBotCategory: string;
}): PageImageAvailability {
  if (input.pageStatus === 403 || input.antiBotCategory !== "NONE") {
    return "IMAGE_BLOCKED";
  }
  const og = extractMeta(input.html, "property", "og:image");
  const jsonLd = extractJsonLdProductImages(input.html);
  const domCount = countProductImagesInDom(input.html);
  if (og || jsonLd.length > 0 || domCount >= 2) {
    return "IMAGE_AVAILABLE_ON_SUPPLIER_PAGE";
  }
  if (input.html.length > 500) {
    return "IMAGE_NOT_AVAILABLE_ON_SUPPLIER_PAGE";
  }
  return "UNKNOWN";
}

async function main() {
  const phase94 = JSON.parse(await readFile(PHASE_94, "utf8")) as {
    task1_decomposition: {
      suppliers: { supplierId: string; decomposition: string }[];
    };
  };
  const phase93 = JSON.parse(await readFile(PHASE_93, "utf8")) as {
    fullSupplierDiagnostics: {
      supplierId: string;
      domain: string | null;
      plannedStrategy: string;
      serpProbe?: {
        organicSameDomainCount: number;
        agoraExtractedCount: number;
      };
      attemptedStrategies?: { strategy: string; status: string; reason?: string }[];
    }[];
  };

  const imageSuppliers = phase94.task1_decomposition.suppliers
    .filter((s) => s.decomposition === "IMAGE_EXTRACTION_FAILURE")
    .map((s) => s.supplierId);

  const prisma = getPrisma();
  const supplierRows = await prisma.supplier.findMany({
    where: { id: { in: [...imageSuppliers, ...HTML_FAILURES, ...LOWES_VARIANTS] } },
    select: {
      id: true,
      domain: true,
      category: true,
      primaryCategoryId: true,
      categoryLinks: { select: { categoryId: true } },
    },
  });
  const byId = new Map(supplierRows.map((r) => [r.id, r]));

  const serpStart = getSerpCacheStats();
  let apiKey: string | null = null;
  try {
    apiKey = getSerpApiKey();
  } catch {
    apiKey = null;
  }

  const inventory: Record<string, unknown>[] = [];
  const stageCounts: Record<string, number> = {};
  const availabilityCounts: Record<string, number> = {};

  for (const supplierId of imageSuppliers) {
    const row = byId.get(supplierId);
    const domain = row?.domain?.trim() ?? null;
    if (!domain) continue;

    const categoryId = row
      ? pickPrimaryCategoryId({
          supplierId: row.id,
          linkCategoryIds: row.categoryLinks.map((l) => l.categoryId),
          legacyCategory: row.category,
        })
      : null;
    const query = resolveSupplierProbeQuery({
      supplierId,
      primaryStrategy: "SERP_SITE_ORGANIC",
      primaryCategoryId: categoryId,
    });

    const qParam = `site:${domain} ${query}`;
    const serpUrl = `https://serpapi.com/search.json?engine=google&q=${encodeURIComponent(qParam)}&api_key=${apiKey ?? "REDACTED"}`;
    let data = readCachedSerp(serpUrl);
    let cacheHit = Boolean(data);
    if (!data && apiKey) {
      try {
        const res = await cachedSerpFetch(serpUrl);
        data = (await res.json()) as Record<string, unknown>;
        cacheHit = res.headers.get("x-agora-serp-cache") === "hit";
      } catch {
        data = null;
      }
    }

    const organicRaw = ((data?.organic_results as { link?: string; title?: string; thumbnail?: string }[]) ?? []).slice(0, 5);
    const organic = organicRaw.filter((i) => i.link && isSameDomain(i.link, domain));

    const urlDiagnostics: Record<string, unknown>[] = [];
    let dominantStage = "unknown";
    let pageAvailability: PageImageAvailability = "UNKNOWN";

    if (organic.length === 0) {
      dominantStage = "serp_organic_thumbnail_missing";
    } else {
      const stageTally: Record<string, number> = {};
      for (const item of organic.slice(0, 3)) {
        const link = item.link!;
        const page = await fetchPage(link);
        const antiBot = classifyAntiBotResponse({
          status: page.status,
          html: page.html,
          url: link,
        });
        const diag = diagnoseUrl({
          link,
          title: item.title ?? query,
          thumbnail: item.thumbnail,
          domain,
          pageStatus: page.status,
          pageHtml: page.html,
        });
        stageTally[diag.stage] = (stageTally[diag.stage] ?? 0) + 1;
        urlDiagnostics.push({
          url: link,
          title: item.title,
          hasThumbnail: Boolean(item.thumbnail),
          resultType: classifyUrl(link),
          pageStatus: page.status,
          failureStage: diag.stage,
          signals: diag.signals,
        });
        if (pageAvailability === "UNKNOWN") {
          pageAvailability = classifyPageAvailability({
            pageStatus: page.status,
            html: page.html,
            antiBotCategory: antiBot.antiBotCategory,
          });
        }
      }
      dominantStage =
        Object.entries(stageTally).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "unknown";
    }

    stageCounts[dominantStage] = (stageCounts[dominantStage] ?? 0) + 1;
    availabilityCounts[pageAvailability] = (availabilityCounts[pageAvailability] ?? 0) + 1;

    const p93 = phase93.fullSupplierDiagnostics.find((d) => d.supplierId === supplierId);
    inventory.push({
      supplierId,
      domain,
      query,
      organicUrlCount: organic.length,
      serpCacheHit: cacheHit,
      dominantFailureStage: dominantStage,
      pageImageAvailability: pageAvailability,
      urlDiagnostics,
      phase93OrganicCount: p93?.serpProbe?.organicSameDomainCount ?? null,
      phase93ExtractedCount: p93?.serpProbe?.agoraExtractedCount ?? null,
    });
  }

  const htmlAnalysis: Record<string, unknown>[] = [];
  for (const supplierId of HTML_FAILURES) {
    const row = byId.get(supplierId);
    const domain = row?.domain ?? null;
    const query = resolveSupplierProbeQuery({
      supplierId,
      primaryStrategy: "HTML_SCRAPE",
      primaryCategoryId: row
        ? pickPrimaryCategoryId({
            supplierId: row.id,
            linkCategoryIds: row.categoryLinks.map((l) => l.categoryId),
            legacyCategory: row.category,
          })
        : null,
    });
    const homepage = domain ? await fetchPage(`https://${domain}/`) : { status: 0, html: "" };
    const searchUrl = domain
      ? `https://${domain}/search?q=${encodeURIComponent(query)}`
      : null;
    const search = searchUrl ? await fetchPage(searchUrl) : { status: 0, html: "" };
    const productLinks = (search.html.match(/href=["'][^"']*(product|sku|item|catalog)[^"']*["']/gi) ?? []).length;

    htmlAnalysis.push({
      supplierId,
      domain,
      query,
      homepageStatus: homepage.status,
      searchStatus: search.status,
      productLinkPatternsOnSearch: productLinks,
      domImagesOnSearch: countProductImagesInDom(search.html),
      recommendation:
        productLinks >= 3 || countProductImagesInDom(search.html) >= 3
          ? "FIX_NOW"
          : search.status === 403
            ? "BLOCKED"
            : "DEFER",
    });
  }

  const lowesAnalysis: Record<string, unknown>[] = [];
  for (const supplierId of LOWES_VARIANTS) {
    const p93 = phase93.fullSupplierDiagnostics.find((d) => d.supplierId === supplierId);
    lowesAnalysis.push({
      supplierId,
      plannedStrategy: p93?.plannedStrategy ?? "SERP_PRODUCT_ENGINE",
      rootCause: "SERP_PRODUCT_ENGINE unsupported in executeExtractionStrategy",
      attemptedStrategies: p93?.attemptedStrategies ?? [],
      reprobeResults: (p93 as { reprobeResultCount?: number })?.reprobeResultCount ?? 0,
      chainExhausted: (p93 as { reprobeChainExhausted?: boolean })?.reprobeChainExhausted ?? true,
      recommendation: "FIX_NOW — wire searchLowes() into SERP_PRODUCT_ENGINE executor",
      note: "Legacy adapter exists (google_shopping via searchLowes); router marks strategy unsupported",
    });
  }

  const serpEnd = getSerpCacheStats();

  const report = {
    generatedAt: new Date().toISOString(),
    phase: "9.6",
    task1_imageFailureInventory: inventory,
    task1_stageCounts: stageCounts,
    task2_pageImageAvailability: availabilityCounts,
    task3_resolutionOptions: buildResolutionOptions(stageCounts, availabilityCounts),
    task4_lowCostValidation: {
      method: "Replay cached site: organic SERP JSON + page fetch only (no new google search unless cache miss)",
      estimatedCreditsPerSupplier: "0-1 (cache miss only)",
      estimatedPageFetches: "3 per image-failure supplier × 30 = ~90",
      validationTimeMinutes: "15-25",
    },
    task5_htmlParserStrategy: htmlAnalysis,
    task6_lowesStrategy: {
      rootCause: "executeExtractionStrategy does not implement SERP_PRODUCT_ENGINE",
      suppliers: lowesAnalysis,
      recommendation: "FIX_NOW",
    },
    task7_recoveryWaves: buildWaves(stageCounts, availabilityCounts),
    task8_successMetrics: {
      routerWinnersTarget: "49 → 69",
      imageCoverage: "≥80% of recovered listings have supplier-domain images",
      noProductsWithoutImages: true,
      serpUsage: "no increase vs Wave 1 baseline",
      noRankingChanges: true,
      noQualityDrop: "maintain MEDIUM tier minimum on recovered SERP rows",
    },
    task9_implementationSequence: [
      "2A: Add JSON-LD Product image extraction before og:image in extractPageImageUrl path",
      "2A: Wire SERP_PRODUCT_ENGINE → searchLowes/searchHomeDepot in executeExtractionStrategy",
      "2B: DOM product-card image extraction fallback",
      "2B: Retry page fetch with alternate headers for 403 cohort",
      "2C: HTML parser fixes for acme_brick, esc_supply, winsupply",
      "2D: Home Depot site-organic image path OR dedicated adapter routing",
    ],
    serpCreditUsage: {
      cacheHits: serpEnd.hits - serpStart.hits,
      cacheMisses: serpEnd.misses - serpStart.misses,
    },
  };

  const outDir = join(process.cwd(), "scripts/output/fingerprint");
  await mkdir(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outPath = join(outDir, `phase9.6-wave2-strategy-${stamp}.json`);
  await writeFile(outPath, JSON.stringify(report, null, 2));

  console.log("\n=== Phase 9.6 Wave 2 Strategy ===\n");
  console.log("Image failure suppliers:", imageSuppliers.length);
  console.log("Stage counts:", stageCounts);
  console.log("Page availability:", availabilityCounts);
  console.log(`\nWrote ${outPath}\n`);

  await prisma.$disconnect();
}

function buildResolutionOptions(
  stages: Record<string, number>,
  availability: Record<string, number>
) {
  const jsonLd = stages["json_ld_image_missing"] ?? 0;
  const ogMissing = stages["page_og_image_missing"] ?? 0;
  const blocked = stages["page_fetch_blocked"] ?? 0;
  const exhausted = stages["all_stages_exhausted"] ?? 0;
  const avail = availability["IMAGE_AVAILABLE_ON_SUPPLIER_PAGE"] ?? 0;

  return [
    {
      option: "A. JSON-LD Product image extraction",
      affected: jsonLd,
      expectedRecovery: jsonLd,
      risk: "LOW",
      effort: "1-2 days",
      serpCreditImpact: "NONE",
      imageQuality: "HIGH — same images supplier exposes to crawlers",
    },
    {
      option: "B. OpenGraph / twitter:image (existing path — fix fetch)",
      affected: ogMissing + blocked,
      expectedRecovery: Math.round((ogMissing + blocked) * 0.6),
      risk: "LOW",
      effort: "1 day",
      serpCreditImpact: "NONE",
      imageQuality: "HIGH",
    },
    {
      option: "E. Alternate fetch headers/user-agent",
      affected: blocked,
      expectedRecovery: Math.round(blocked * 0.4),
      risk: "MEDIUM",
      effort: "1-2 days",
      serpCreditImpact: "NONE",
      imageQuality: "HIGH if unblocked",
    },
    {
      option: "C. DOM image near product title",
      affected: exhausted,
      expectedRecovery: Math.round(exhausted * 0.5),
      risk: "MEDIUM",
      effort: "3-4 days",
      serpCreditImpact: "NONE",
      imageQuality: "MEDIUM-HIGH",
    },
    {
      option: "Wire SERP_PRODUCT_ENGINE executor (Lowe's/Home Depot)",
      affected: 10,
      expectedRecovery: 10,
      risk: "LOW",
      effort: "1 day",
      serpCreditImpact: "LOW — google_shopping cache",
      imageQuality: "HIGH — shopping thumbnails",
    },
    {
      option: "I. Google image fallback improvements",
      affected: avail,
      expectedRecovery: Math.round(avail * 0.2),
      risk: "MEDIUM",
      effort: "2 days",
      serpCreditImpact: "MEDIUM — google_images API",
      imageQuality: "VARIABLE",
    },
    {
      option: "H. Async image enrichment",
      affected: 0,
      expectedRecovery: 0,
      risk: "HIGH",
      effort: "HIGH",
      serpCreditImpact: "LOW",
      imageQuality: "DEFER — violates synchronous mirroring principle",
    },
  ];
}

function buildWaves(stages: Record<string, number>, availability: Record<string, number>) {
  return {
    wave2A: {
      name: "JSON-LD extraction + SERP_PRODUCT_ENGINE wiring",
      suppliersAffected: (stages["json_ld_image_missing"] ?? 0) + 10,
      estimatedRecovery: (stages["json_ld_image_missing"] ?? 0) + 10,
      effort: "2-3 days",
      risk: "LOW",
      creditCost: "LOW",
    },
    wave2B: {
      name: "Page fetch fixes + DOM product image fallback",
      suppliersAffected:
        (stages["page_og_image_missing"] ?? 0) +
        (stages["page_fetch_blocked"] ?? 0) +
        (stages["all_stages_exhausted"] ?? 0),
      estimatedRecovery: 12,
      effort: "4-5 days",
      risk: "MEDIUM",
      creditCost: "NONE",
    },
    wave2C: {
      name: "HTML parser edge cases",
      suppliersAffected: 3,
      estimatedRecovery: 1,
      effort: "3-5 days",
      risk: "MEDIUM-HIGH",
      creditCost: "NONE",
    },
    wave2D: {
      name: "Home Depot site-organic image path",
      suppliersAffected: 5,
      estimatedRecovery: 5,
      effort: "2-3 days",
      risk: "MEDIUM",
      creditCost: "LOW",
    },
  };
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
