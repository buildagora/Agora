/**
 * Phase 8F.3 — schema cohort sitemap/discovery investigation (read-only).
 *
 *   npx tsx scripts/fingerprint/phase8f3-schema-investigation.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { getPrisma } from "../../src/lib/db.server";
import { loadSupplierFingerprintFacts } from "../../src/lib/suppliers/fingerprint/loadSupplierFingerprintFacts.server";
import { fetchSchemaSitemapUrl } from "../../src/lib/suppliers/schema/fetchSchemaSitemap.server";
import {
  isProductDiscoveryUrl,
  isSitemapIndex,
  normalizeStoredSitemapUrls,
  orderSitemapFetchCandidates,
  parseRobotsSitemapUrls,
  parseSitemapLocUrls,
  pickProductCandidateUrls,
} from "../../src/lib/suppliers/schema/sitemapParse";
import { rankBrowseUrlsByQuery } from "../../src/lib/suppliers/schema/rankBrowseUrlsByQuery";
import { classifyAntiBotResponse } from "../../src/lib/suppliers/fingerprint/classifyAntiBotResponse";

const SUPPLIERS = [
  { id: "grainger_hsv", query: "safety gloves" },
  { id: "shearer_supply_hsv", query: "filter" },
  { id: "bfs_hsv", query: "lumber" },
  { id: "city_electric_hsv", query: "wire" },
] as const;

async function fetchRobots(domain: string) {
  const url = `https://${domain}/robots.txt`;
  const res = await fetchSchemaSitemapUrl(url);
  return {
    url,
    status: res.status,
    sitemapUrls: res.status === 200 ? parseRobotsSitemapUrls(res.html) : [],
    snippet: res.html.slice(0, 500),
  };
}

async function probeSitemapChain(storedUrls: string[]) {
  const ordered = orderSitemapFetchCandidates(storedUrls);
  const chain: Record<string, unknown>[] = [];
  let productUrls: string[] = [];

  for (const sitemapUrl of ordered.slice(0, 3)) {
    const res = await fetchSchemaSitemapUrl(sitemapUrl);
    const entry: Record<string, unknown> = {
      url: sitemapUrl,
      status: res.status,
      isIndex: res.status === 200 ? isSitemapIndex(res.html) : false,
      locCount:
        res.status === 200 ? parseSitemapLocUrls(res.html, 5000).length : 0,
      sampleLocs:
        res.status === 200 ? parseSitemapLocUrls(res.html, 5) : [],
    };
    chain.push(entry);

    if (res.status !== 200 || !res.html.includes("<loc>")) continue;

    if (isSitemapIndex(res.html)) {
      const children = orderSitemapFetchCandidates(
        parseSitemapLocUrls(res.html, 50)
      );
      entry.childCount = children.length;
      entry.childSample = children.slice(0, 5);
      for (const childUrl of children.slice(0, 5)) {
        const childRes = await fetchSchemaSitemapUrl(childUrl);
        const childLocs = parseSitemapLocUrls(childRes.html, 5000);
        const discovery = childLocs.filter(isProductDiscoveryUrl);
        chain.push({
          url: childUrl,
          status: childRes.status,
          isIndex: childRes.status === 200 ? isSitemapIndex(childRes.html) : false,
          locCount: childLocs.length,
          discoveryCount: discovery.length,
          discoverySample: discovery.slice(0, 5),
        });
        if (discovery.length > 0) {
          productUrls = discovery;
          break;
        }
      }
    } else {
      const locs = parseSitemapLocUrls(res.html, 5000);
      const discovery = locs.filter(isProductDiscoveryUrl);
      entry.discoveryCount = discovery.length;
      entry.discoverySample = discovery.slice(0, 5);
      if (discovery.length > 0) productUrls = discovery;
    }
    if (productUrls.length > 0) break;
  }

  return { chain, productUrls };
}

async function probeProductPage(url: string) {
  const res = await fetchSchemaSitemapUrl(url);
  const antiBot = classifyAntiBotResponse({
    status: res.status,
    html: res.html,
    url,
  });
  return {
    url,
    status: res.status,
    antiBotRisk: antiBot.antiBotRisk,
    htmlBytes: res.html.length,
    hasJsonLdProduct: res.html.includes('"@type":"Product"') ||
      res.html.includes('"@type": "Product"'),
  };
}

async function main() {
  const prisma = getPrisma();
  const report: Record<string, unknown> = {
    generatedAt: new Date().toISOString(),
    phase: "8F.3",
    suppliers: [],
  };

  for (const { id, query } of SUPPLIERS) {
    const facts = await loadSupplierFingerprintFacts(id);
    const domain = facts?.canonicalDomain ?? null;
    const storedUrls = normalizeStoredSitemapUrls(facts?.sitemapUrls);
    const row: Record<string, unknown> = {
      supplierId: id,
      domain,
      query,
      fingerprint: {
        hasSitemap: facts?.hasSitemap,
        hasSchemaMarkup: facts?.hasSchemaMarkup,
        antiBotLevel: facts?.antiBotLevel,
        storedSitemapCount: storedUrls.length,
        storedSitemapUrls: storedUrls,
      },
    };

    if (domain) {
      row.robots = await fetchRobots(domain);
    }

    const { chain, productUrls } = await probeSitemapChain(storedUrls);
    row.sitemapProbe = { chain, productUrlCount: productUrls.length };
    row.rankedForQuery = rankBrowseUrlsByQuery(productUrls, query, 10);

    const candidates = pickProductCandidateUrls(productUrls, 3);
    row.productPageProbes = [];
    for (const url of candidates) {
      (row.productPageProbes as unknown[]).push(await probeProductPage(url));
    }

    (report.suppliers as unknown[]).push(row);
    console.log(
      `${id}: sitemaps=${storedUrls.length} discovery=${productUrls.length} antiBot=${facts?.antiBotLevel}`
    );
  }

  const outDir = join(process.cwd(), "scripts/output/fingerprint");
  await mkdir(outDir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const outPath = join(outDir, `phase8f3-schema-investigation-${ts}.json`);
  await writeFile(outPath, JSON.stringify(report, null, 2));
  console.log(`\nWritten: ${outPath}\n`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
