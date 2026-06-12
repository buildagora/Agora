import { classifyUrl } from "@/lib/search/classification/classifyUrl";
import {
  fetchProbeUrl,
  type ProbeFetchDeps,
  ProbeRequestBudget,
} from "./probeHttp.server";
import { detectAntiBotRisk } from "./probeRendering.server";
import type { SchemaSitemapProbeFacts } from "./types";
import {
  extractJsonLdBlocks,
  hasProductJsonLd,
  isSitemapIndex,
  jsonLdContainsProduct,
  parseRobotsSitemapUrls,
  parseSitemapLocUrls,
  pickProductCandidateUrls,
} from "../schema/sitemapParse";

export const SCHEMA_PROBE_MAX_REQUESTS = 5;

export type SchemaSitemapProbeResult = SchemaSitemapProbeFacts & {
  probeNotes: string[];
};

export {
  extractJsonLdBlocks,
  hasProductJsonLd,
  isSitemapIndex,
  jsonLdContainsProduct,
  parseRobotsSitemapUrls,
  parseSitemapLocUrls,
  pickProductCandidateUrls,
};

function siteOrigins(domain: string): string[] {
  const normalized = domain.replace(/^www\./, "").trim();
  return [`https://www.${normalized}`, `https://${normalized}`];
}

export async function probeSchemaSitemap(
  domain: string,
  deps?: ProbeFetchDeps
): Promise<SchemaSitemapProbeResult> {
  const notes: string[] = [];
  const budget = new ProbeRequestBudget(SCHEMA_PROBE_MAX_REQUESTS);
  const discoveredSitemapUrls: string[] = [];
  let hasSitemap = false;
  let hasSchemaMarkup = false;

  let originUsed: string | null = null;
  let robotsTxt = "";

  for (const origin of siteOrigins(domain)) {
    if (!budget.consume()) break;
    const robotsUrl = `${origin}/robots.txt`;
    const res = await fetchProbeUrl(robotsUrl, deps);
    if (res.status === 200 && res.html.trim()) {
      robotsTxt = res.html;
      originUsed = origin;
      notes.push(`robots:${robotsUrl}`);
      break;
    }
  }

  let sitemapCandidates = parseRobotsSitemapUrls(robotsTxt);
  if (sitemapCandidates.length === 0 && originUsed && budget.canFetch()) {
    if (budget.consume()) {
      const fallback = `${originUsed}/sitemap.xml`;
      sitemapCandidates = [fallback];
      notes.push(`sitemap_fallback:${fallback}`);
    }
  } else if (sitemapCandidates.length > 0) {
    notes.push(`robots_sitemaps:${sitemapCandidates.length}`);
  }

  let pageUrls: string[] = [];

  if (sitemapCandidates.length > 0 && budget.canFetch()) {
    const indexUrl = sitemapCandidates[0];
    if (budget.consume()) {
      const indexRes = await fetchProbeUrl(indexUrl, deps);
      if (indexRes.status === 200 && indexRes.html.includes("<loc>")) {
        hasSitemap = true;
        discoveredSitemapUrls.push(indexUrl);

        if (isSitemapIndex(indexRes.html)) {
          const childSitemaps = parseSitemapLocUrls(indexRes.html, 50);
          discoveredSitemapUrls.push(...childSitemaps.slice(0, 5));

          if (childSitemaps.length > 0 && budget.canFetch()) {
            const childUrl = childSitemaps[0];
            if (budget.consume()) {
              const childRes = await fetchProbeUrl(childUrl, deps);
              if (childRes.status === 200 && childRes.html.includes("<loc>")) {
                pageUrls = parseSitemapLocUrls(childRes.html, 200);
                notes.push(`child_sitemap:${childUrl}`);
              }
            }
          }
        } else {
          pageUrls = parseSitemapLocUrls(indexRes.html, 200);
          notes.push(`sitemap_urlset:${indexUrl}`);
        }
      }
    }
  }

  const productCandidates = pickProductCandidateUrls(pageUrls, 3);
  notes.push(`product_candidates:${productCandidates.length}`);

  for (const candidate of productCandidates) {
    if (!budget.canFetch()) break;
    if (!budget.consume()) break;

    const res = await fetchProbeUrl(candidate, deps);
    const risk = detectAntiBotRisk({
      status: res.status,
      html: res.html,
    });
    if (risk === "HARD_BLOCK" || risk === "HIGH") {
      notes.push(`product_fetch_blocked:${candidate}`);
      continue;
    }
    if (hasProductJsonLd(res.html)) {
      hasSchemaMarkup = true;
      notes.push(`product_schema:${candidate}`);
      break;
    }
  }

  if (!hasSchemaMarkup && originUsed && budget.canFetch()) {
    const homepageCandidates = [`${originUsed}/`, ...productCandidates].slice(
      0,
      1
    );
    for (const url of homepageCandidates) {
      if (!budget.canFetch()) break;
      if (!budget.consume()) break;
      const res = await fetchProbeUrl(url, deps);
      if (hasProductJsonLd(res.html)) {
        hasSchemaMarkup = true;
        notes.push(`homepage_schema:${url}`);
        break;
      }
    }
  }

  return {
    hasSchemaMarkup,
    hasSitemap,
    sitemapUrls: discoveredSitemapUrls.length > 0 ? discoveredSitemapUrls : null,
    probeNotes: notes,
  };
}
