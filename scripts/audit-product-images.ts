/**
 * Marketplace-wide product image audit.
 *
 * Usage (repo root):
 *   npx tsx -r dotenv/config scripts/audit-product-images.ts dotenv_config_path=.env.local
 *
 * Options:
 *   --dry-run              Supplier inventory only (no SerpAPI / DB capability queries)
 *   --skip-generic         Skip GENERIC_DOMAIN suppliers (faster; registry + capability only)
 *   --probe                HEAD-request imageUrl hosts (slow; classifies broken URLs)
 *   --include-all-generic  Run searchSupplierSite for every domain supplier (expensive)
 *   --max-generic N        Cap generic-domain suppliers (default: all if --include-all-generic, else 30)
 *   --output-dir PATH      Default: scripts/output/product-image-audit
 */

import { config as loadEnv } from "dotenv";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getPrisma } from "@/lib/db.server";
import { searchCapabilities } from "@/lib/search/capabilitySearch";
import {
  findSupplierSearchAdapter,
  supplierSearchRegistry,
  type SupplierSearchFn,
} from "@/lib/suppliers/registry";
import { SUPPLIER_ADAPTER_PREFIXES } from "@/lib/suppliers/supplierAdapterPrefixes";
import type { SupplierProductResult, SupplierProductSource } from "@/lib/suppliers/types";
import { searchSupplierSite } from "@/lib/suppliers/searchSupplierSite";

loadEnv({ path: ".env.local" });
loadEnv();

const DEFAULT_QUERIES = [
  "sink",
  "shingles",
  "drywall",
  "paint",
  "pipe",
  "hvac unit",
  "flooring",
  "electrical panel",
] as const;

type ListingPath =
  | "REGISTRY_ADAPTER"
  | "GENERIC_DOMAIN"
  | "CAPABILITY_ONLY"
  | "CAPABILITY_AND_AUTOMATED"
  | "NO_LISTING";

type ImageListingPolicy =
  | "REQUIRES_IMAGE" // organic site search drops rows without imageUrl
  | "ALLOWS_NULL_IMAGE" // big-box adapters keep rows with null imageUrl
  | "NO_PRODUCT_IMAGE"; // capability cards never have product images

type RootCause =
  | "SOURCE_NEVER_PROVIDED"
  | "DISCARDED_IN_CODE"
  | "URL_BROKEN"
  | "RENDERING_FALLBACK"
  | "UNKNOWN";

type SupplierInventoryRow = {
  supplierId: string;
  name: string;
  category: string;
  domain: string | null;
  listingPath: ListingPath;
  adapterPrefix: string | null;
  adapterSource: SupplierProductSource | "GENERIC" | "CAPABILITY" | null;
  imageListingPolicy: ImageListingPolicy;
  imagesRequiredForListing: boolean;
  listingsCanHaveNullImageUrl: boolean;
  capabilityRowCount: number;
};

type ProductAuditRow = {
  supplierId: string;
  supplierName: string;
  category: string;
  query: string;
  title: string;
  listingPath: ListingPath;
  adapterSource: string;
  imageUrl: string | null;
  imageUrlPresent: boolean;
  imageHost: string | null;
  imageProbeStatus: "skipped" | "ok" | "broken" | "no_url";
  uiImageSrc: string | null;
  uiWouldUsePlaceholderPath: boolean;
  uiWouldUseUnsplash: boolean;
  rootCause: RootCause;
};

function parseArgs(argv: string[]) {
  const dryRun = argv.includes("--dry-run");
  const skipGeneric = argv.includes("--skip-generic");
  const probe = argv.includes("--probe");
  const includeAllGeneric = argv.includes("--include-all-generic");
  const maxGenericIdx = argv.indexOf("--max-generic");
  const maxGeneric =
    maxGenericIdx >= 0 && argv[maxGenericIdx + 1]
      ? Number.parseInt(argv[maxGenericIdx + 1], 10)
      : includeAllGeneric
        ? Number.POSITIVE_INFINITY
        : 30;
  const outIdx = argv.indexOf("--output-dir");
  const outputDir =
    outIdx >= 0 && argv[outIdx + 1]
      ? argv[outIdx + 1]
      : join(process.cwd(), "scripts/output/product-image-audit");
  return { dryRun, skipGeneric, probe, includeAllGeneric, maxGeneric, outputDir };
}

function adapterPrefixFor(supplierId: string): string | null {
  for (const p of SUPPLIER_ADAPTER_PREFIXES) {
    if (supplierId.startsWith(p)) return p;
  }
  return null;
}

function imageListingPolicyFor(
  listingPath: ListingPath,
  prefix: string | null,
): ImageListingPolicy {
  if (listingPath === "CAPABILITY_ONLY" || listingPath === "NO_LISTING") {
    return listingPath === "CAPABILITY_ONLY" ? "NO_PRODUCT_IMAGE" : "NO_PRODUCT_IMAGE";
  }
  if (prefix === "home_depot" || prefix === "lowes") return "ALLOWS_NULL_IMAGE";
  if (listingPath === "REGISTRY_ADAPTER" || listingPath === "GENERIC_DOMAIN") {
    return "REQUIRES_IMAGE";
  }
  return "REQUIRES_IMAGE";
}

function classifyListingPath(
  supplierId: string,
  domain: string | null,
  capabilityCount: number,
): ListingPath {
  const prefix = adapterPrefixFor(supplierId);
  const hasRegistry = prefix != null;
  const hasDomain = Boolean(domain?.trim());
  const hasCapability = capabilityCount > 0;

  if (hasRegistry && hasCapability) return "CAPABILITY_AND_AUTOMATED";
  if (hasRegistry) return "REGISTRY_ADAPTER";
  if (hasDomain) return "GENERIC_DOMAIN";
  if (hasCapability) return "CAPABILITY_ONLY";
  return "NO_LISTING";
}

function imageHost(url: string | null | undefined): string | null {
  if (!url?.trim()) return null;
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** Mirrors DeepSupplierDetail BROAD grid image resolution (automated + legacy capability). */
function resolveUiImageSrc(args: {
  imageUrl: string | null | undefined;
  imageQuery?: string | null;
}): {
  uiImageSrc: string | null;
  usesPlaceholderPath: boolean;
  usesUnsplash: boolean;
} {
  const url = args.imageUrl?.trim();
  if (url) {
    return { uiImageSrc: url, usesPlaceholderPath: false, usesUnsplash: false };
  }
  const q = args.imageQuery?.trim();
  if (q) {
    return {
      uiImageSrc: `https://source.unsplash.com/featured/?${encodeURIComponent(q)}`,
      usesPlaceholderPath: false,
      usesUnsplash: true,
    };
  }
  return {
    uiImageSrc: "/placeholder.png",
    usesPlaceholderPath: true,
    usesUnsplash: false,
  };
}

function classifyRootCause(row: {
  imageUrlPresent: boolean;
  imageListingPolicy: ImageListingPolicy;
  listingPath: ListingPath;
  imageProbeStatus: ProductAuditRow["imageProbeStatus"];
  uiWouldUsePlaceholderPath: boolean;
  uiWouldUseUnsplash: boolean;
}): RootCause {
  if (row.imageProbeStatus === "broken") return "URL_BROKEN";
  if (
    row.uiWouldUsePlaceholderPath ||
    row.uiWouldUseUnsplash ||
    (row.listingPath === "CAPABILITY_ONLY" && !row.imageUrlPresent)
  ) {
    return "RENDERING_FALLBACK";
  }
  if (!row.imageUrlPresent && row.imageListingPolicy === "ALLOWS_NULL_IMAGE") {
    return "SOURCE_NEVER_PROVIDED";
  }
  if (!row.imageUrlPresent && row.imageListingPolicy === "NO_PRODUCT_IMAGE") {
    return "SOURCE_NEVER_PROVIDED";
  }
  if (row.imageUrlPresent) return "UNKNOWN";
  return "SOURCE_NEVER_PROVIDED";
}

async function probeImageUrl(url: string): Promise<"ok" | "broken"> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      signal: controller.signal,
      headers: { "User-Agent": "AgoraProductImageAudit/1.0" },
    });
    clearTimeout(timer);
    if (res.ok || res.status === 304) return "ok";
    if (res.status === 405) {
      const getRes = await fetch(url, {
        method: "GET",
        redirect: "follow",
        signal: AbortSignal.timeout(8000),
        headers: { "User-Agent": "AgoraProductImageAudit/1.0" },
      });
      return getRes.ok ? "ok" : "broken";
    }
    return "broken";
  } catch {
    return "broken";
  }
}

async function fetchAutomatedProducts(
  supplierId: string,
  query: string,
  domain: string | null,
): Promise<{ results: SupplierProductResult[]; source: string }> {
  const adapter = findSupplierSearchAdapter(supplierId);
  if (adapter) {
    const all = await adapter.search(query);
    return {
      results: all.filter((r) => r.supplierId === supplierId),
      source: adapter.apiSource,
    };
  }
  if (domain?.trim()) {
    const results = await searchSupplierSite({
      query,
      domain: domain.trim(),
      supplierIds: [supplierId],
      source: "GENERIC",
      logLabel: supplierId,
    });
    return { results, source: "GENERIC" };
  }
  return { results: [], source: "NONE" };
}

function capabilityProductsForSupplier(
  supplierId: string,
  query: string,
  matches: Awaited<ReturnType<typeof searchCapabilities>>,
): SupplierProductResult[] {
  return matches
    .filter((m) => m.supplierId === supplierId)
    .slice(0, 6)
    .map((m) => {
      const title = [m.brand, m.productLine, m.subcategory].filter(Boolean).join(" ");
      return {
        supplierId,
        title: title || query,
        brand: m.brand,
        imageUrl: null,
        productUrl: m.sourceUrl ?? null,
        source: "GENERIC",
      };
    });
}

async function buildSupplierInventory(): Promise<SupplierInventoryRow[]> {
  const prisma = getPrisma();
  const suppliers = await prisma.supplier.findMany({
    select: {
      id: true,
      name: true,
      category: true,
      domain: true,
    },
    orderBy: { name: "asc" },
  });

  const capabilityCounts = await prisma.supplierCapability.groupBy({
    by: ["supplierId"],
    _count: { _all: true },
  });
  const capCountBySupplier = new Map(
    capabilityCounts.map((r) => [r.supplierId, r._count._all]),
  );

  return suppliers.map((s) => {
    const capabilityRowCount = capCountBySupplier.get(s.id) ?? 0;
    const prefix = adapterPrefixFor(s.id);
    const listingPath = classifyListingPath(
      s.id,
      s.domain,
      capabilityRowCount,
    );
    const policy = imageListingPolicyFor(listingPath, prefix);
    let adapterSource: SupplierInventoryRow["adapterSource"] = null;
    if (prefix && prefix in supplierSearchRegistry) {
      adapterSource = findSupplierSearchAdapter(s.id)?.apiSource ?? null;
    } else if (listingPath === "GENERIC_DOMAIN") {
      adapterSource = "GENERIC";
    } else if (listingPath === "CAPABILITY_ONLY") {
      adapterSource = "CAPABILITY";
    }

    return {
      supplierId: s.id,
      name: s.name,
      category: s.category,
      domain: s.domain,
      listingPath,
      adapterPrefix: prefix,
      adapterSource,
      imageListingPolicy: policy,
      imagesRequiredForListing: policy === "REQUIRES_IMAGE",
      listingsCanHaveNullImageUrl:
        policy === "ALLOWS_NULL_IMAGE" || policy === "NO_PRODUCT_IMAGE",
      capabilityRowCount,
    };
  });
}

async function runRegistryPrefixBatch(
  prefix: string,
  search: SupplierSearchFn,
  query: string,
  supplierIds: string[],
): Promise<Map<string, SupplierProductResult[]>> {
  const all = await search(query);
  const bySupplier = new Map<string, SupplierProductResult[]>();
  for (const id of supplierIds) {
    bySupplier.set(
      id,
      all.filter((r) => r.supplierId === id),
    );
  }
  return bySupplier;
}

function pct(n: number, d: number): string {
  if (d === 0) return "n/a";
  return `${((n / d) * 100).toFixed(1)}%`;
}

function renderMarkdownReport(args: {
  inventory: SupplierInventoryRow[];
  products: ProductAuditRow[];
  queries: string[];
  probe: boolean;
}): string {
  const { inventory, products, queries, probe } = args;
  const listingCapable = inventory.filter((s) => s.listingPath !== "NO_LISTING");
  const withImages = products.filter((p) => p.imageUrlPresent).length;
  const total = products.length;
  const uiNonNull = products.filter((p) => p.uiImageSrc && !p.uiWouldUsePlaceholderPath).length;

  const bySupplier = new Map<string, ProductAuditRow[]>();
  for (const p of products) {
    const list = bySupplier.get(p.supplierId) ?? [];
    list.push(p);
    bySupplier.set(p.supplierId, list);
  }

  const byCategory = new Map<string, ProductAuditRow[]>();
  for (const p of products) {
    const list = byCategory.get(p.category) ?? [];
    list.push(p);
    byCategory.set(p.category, list);
  }

  const rootCounts = new Map<RootCause, number>();
  for (const p of products) {
    rootCounts.set(p.rootCause, (rootCounts.get(p.rootCause) ?? 0) + 1);
  }

  let md = `# Agora product image audit\n\n`;
  md += `Generated: ${new Date().toISOString()}\n\n`;
  md += `Queries: ${queries.join(", ")}\n\n`;
  md += `Image probe (HEAD): ${probe ? "enabled" : "disabled"}\n\n`;

  md += `## A. Marketplace summary\n\n`;
  md += `| Metric | Value |\n|--------|-------|\n`;
  md += `| Total suppliers in DB | ${inventory.length} |\n`;
  md += `| Suppliers capable of listings | ${listingCapable.length} |\n`;
  md += `| Total product records audited | ${total} |\n`;
  md += `| Records with \`imageUrl\` present | ${withImages} (${pct(withImages, total)}) |\n`;
  md += `| Records missing \`imageUrl\` | ${total - withImages} (${pct(total - withImages, total)}) |\n`;
  md += `| Records with real UI src (not /placeholder.png) | ${uiNonNull} (${pct(uiNonNull, total)}) |\n`;
  md += `| **Marketplace image coverage (imageUrl present)** | **${pct(withImages, total)}** |\n\n`;

  md += `### Listing path distribution (all suppliers)\n\n`;
  const pathCounts = new Map<ListingPath, number>();
  for (const s of inventory) {
    pathCounts.set(s.listingPath, (pathCounts.get(s.listingPath) ?? 0) + 1);
  }
  for (const [path, count] of [...pathCounts.entries()].sort((a, b) => b[1] - a[1])) {
    md += `- ${path}: ${count}\n`;
  }
  md += `\n`;

  md += `## B. Coverage by supplier\n\n`;
  md += `| Supplier | Category | Path | Products | With imageUrl | Coverage |\n`;
  md += `|----------|----------|------|----------|---------------|----------|\n`;
  const supplierRows = [...bySupplier.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  for (const [supplierId, rows] of supplierRows) {
    const inv = inventory.find((s) => s.supplierId === supplierId);
    const img = rows.filter((r) => r.imageUrlPresent).length;
    md += `| ${inv?.name ?? supplierId} | ${inv?.category ?? "—"} | ${inv?.listingPath ?? "—"} | ${rows.length} | ${img} | ${pct(img, rows.length)} |\n`;
  }
  md += `\n`;

  md += `## C. Coverage by category\n\n`;
  md += `| Category | Products | With imageUrl | Coverage |\n`;
  md += `|----------|----------|---------------|----------|\n`;
  for (const [cat, rows] of [...byCategory.entries()].sort((a, b) => b[1].length - a[1].length)) {
    const img = rows.filter((r) => r.imageUrlPresent).length;
    md += `| ${cat} | ${rows.length} | ${img} | ${pct(img, rows.length)} |\n`;
  }
  md += `\n`;

  md += `## D. Root cause breakdown\n\n`;
  md += `| Category | Count | % of products |\n`;
  md += `|----------|-------|----------------|\n`;
  const causeLabels: Record<RootCause, string> = {
    SOURCE_NEVER_PROVIDED: "1. Source never provided image",
    DISCARDED_IN_CODE: "2. Image discarded in code (not observable in output rows)",
    URL_BROKEN: "3. Image URL broken (probe)",
    RENDERING_FALLBACK: "4. Rendering / fallback issue",
    UNKNOWN: "5. Unknown",
  };
  for (const cause of Object.keys(causeLabels) as RootCause[]) {
    const c = rootCounts.get(cause) ?? 0;
    md += `| ${causeLabels[cause]} | ${c} | ${pct(c, total)} |\n`;
  }
  md += `\n`;

  md += `## Supplier inventory (listing capability)\n\n`;
  md += `| supplierId | name | category | listingPath | image policy | capabilities |\n`;
  md += `|------------|------|----------|-------------|--------------|-------------|\n`;
  for (const s of inventory) {
    md += `| ${s.supplierId} | ${s.name} | ${s.category} | ${s.listingPath} | ${s.imageListingPolicy} | ${s.capabilityRowCount} |\n`;
  }

  return md;
}

async function main() {
  const { dryRun, skipGeneric, probe, includeAllGeneric, maxGeneric, outputDir } =
    parseArgs(process.argv.slice(2));
  const queries = [...DEFAULT_QUERIES];

  mkdirSync(outputDir, { recursive: true });

  console.log("[audit] Building supplier inventory...");
  const inventory = await buildSupplierInventory();
  writeFileSync(
    join(outputDir, "supplier-inventory.json"),
    JSON.stringify(inventory, null, 2),
  );

  const listingCapable = inventory.filter((s) => s.listingPath !== "NO_LISTING");
  const automated = inventory.filter(
    (s) =>
      s.listingPath === "REGISTRY_ADAPTER" ||
      s.listingPath === "CAPABILITY_AND_AUTOMATED" ||
      s.listingPath === "GENERIC_DOMAIN",
  );
  const capabilityOnly = inventory.filter((s) => s.listingPath === "CAPABILITY_ONLY");

  console.log(`[audit] Suppliers in DB: ${inventory.length}`);
  console.log(`[audit] Listing-capable: ${listingCapable.length}`);
  console.log(`[audit] Automated paths: ${automated.length}`);
  console.log(`[audit] Capability-only: ${capabilityOnly.length}`);

  if (dryRun) {
    console.log("[audit] --dry-run: skipping product fetches.");
    const md = renderMarkdownReport({ inventory, products: [], queries, probe });
    writeFileSync(join(outputDir, "report.md"), md);
    console.log(`[audit] Wrote ${outputDir}/supplier-inventory.json and report.md`);
    return;
  }

  try {
    const { getSerpApiKey } = await import("@/lib/config/env");
    getSerpApiKey();
  } catch {
    console.warn(
      "[audit] SERPAPI_API_KEY missing — automated searches will fail; capability path still runs.",
    );
  }

  const products: ProductAuditRow[] = [];
  const invById = new Map(inventory.map((s) => [s.supplierId, s]));

  // Registry: batch by prefix × query
  const prefixToSupplierIds = new Map<string, string[]>();
  for (const s of automated.filter((s) => s.listingPath !== "GENERIC_DOMAIN")) {
    const p = s.adapterPrefix;
    if (!p) continue;
    const list = prefixToSupplierIds.get(p) ?? [];
    list.push(s.supplierId);
    prefixToSupplierIds.set(p, list);
  }

  for (const query of queries) {
    console.log(`[audit] Query: "${query}"`);
    const capMatches = await searchCapabilities(query);

    for (const [prefix, supplierIds] of prefixToSupplierIds) {
      const search = supplierSearchRegistry[prefix as keyof typeof supplierSearchRegistry];
      if (!search) continue;
      console.log(`  [registry] prefix=${prefix} suppliers=${supplierIds.length}`);
      try {
        const bySupplier = await runRegistryPrefixBatch(prefix, search, query, supplierIds);
        for (const supplierId of supplierIds) {
          const inv = invById.get(supplierId)!;
          const results = bySupplier.get(supplierId) ?? [];
          for (const r of results) {
            await pushProductRow(products, inv, query, r, probe);
          }
          if (
            results.length === 0 &&
            (inv.listingPath === "CAPABILITY_AND_AUTOMATED" ||
              inv.capabilityRowCount > 0)
          ) {
            for (const r of capabilityProductsForSupplier(supplierId, query, capMatches)) {
              await pushProductRow(
                products,
                { ...inv, listingPath: "CAPABILITY_ONLY", adapterSource: "CAPABILITY" },
                query,
                r,
                probe,
                true,
              );
            }
          }
        }
      } catch (err) {
        console.warn(`  [registry] prefix=${prefix} failed:`, err);
      }
    }

    // Generic domain suppliers
    let genericSuppliers = skipGeneric
      ? []
      : automated.filter((s) => s.listingPath === "GENERIC_DOMAIN");
    if (!includeAllGeneric && Number.isFinite(maxGeneric)) {
      genericSuppliers = genericSuppliers.slice(0, maxGeneric);
    } else if (Number.isFinite(maxGeneric)) {
      genericSuppliers = genericSuppliers.slice(0, maxGeneric);
    }

    for (const inv of genericSuppliers) {
      if (!inv.domain) continue;
      console.log(`  [generic] ${inv.supplierId} (${inv.domain})`);
      try {
        const { results, source } = await fetchAutomatedProducts(
          inv.supplierId,
          query,
          inv.domain,
        );
        for (const r of results) {
          await pushProductRow(
            products,
            { ...inv, adapterSource: source as SupplierInventoryRow["adapterSource"] },
            query,
            r,
            probe,
          );
        }
      } catch (err) {
        console.warn(`  [generic] ${inv.supplierId} failed:`, err);
      }
    }

    // Capability-only suppliers
    for (const inv of capabilityOnly) {
      const caps = capabilityProductsForSupplier(inv.supplierId, query, capMatches);
      for (const r of caps) {
        await pushProductRow(products, inv, query, r, probe, true);
      }
    }
  }

  writeFileSync(join(outputDir, "products.json"), JSON.stringify(products, null, 2));

  const md = renderMarkdownReport({ inventory, products, queries, probe });
  writeFileSync(join(outputDir, "report.md"), md);

  // Architecture section appended
  const arch = buildArchitectureSection(inventory, products);
  writeFileSync(join(outputDir, "architecture-recommendation.md"), arch);

  console.log(`\n[audit] Done. Output: ${outputDir}/`);
  console.log(`  Products audited: ${products.length}`);
  console.log(
    `  imageUrl present: ${products.filter((p) => p.imageUrlPresent).length} (${pct(products.filter((p) => p.imageUrlPresent).length, products.length)})`,
  );
}

async function pushProductRow(
  products: ProductAuditRow[],
  inv: SupplierInventoryRow,
  query: string,
  r: SupplierProductResult,
  probe: boolean,
  isCapabilityCard = false,
) {
  const imageUrl = r.imageUrl?.trim() || null;
  const imageUrlPresent = Boolean(imageUrl);
  const ui = resolveUiImageSrc({
    imageUrl,
    imageQuery: isCapabilityCard ? r.title : null,
  });

  let imageProbeStatus: ProductAuditRow["imageProbeStatus"] = imageUrl
    ? "skipped"
    : "no_url";
  if (probe && imageUrl) {
    imageProbeStatus = (await probeImageUrl(imageUrl)) === "ok" ? "ok" : "broken";
  }

  const rootCause = classifyRootCause({
    imageUrlPresent,
    imageListingPolicy: inv.imageListingPolicy,
    listingPath: inv.listingPath,
    imageProbeStatus,
    uiWouldUsePlaceholderPath: ui.usesPlaceholderPath,
    uiWouldUseUnsplash: ui.usesUnsplash,
  });

  products.push({
    supplierId: inv.supplierId,
    supplierName: inv.name,
    category: inv.category,
    query,
    title: r.title,
    listingPath: inv.listingPath,
    adapterSource: String(r.source ?? inv.adapterSource ?? "UNKNOWN"),
    imageUrl,
    imageUrlPresent,
    imageHost: imageHost(imageUrl),
    imageProbeStatus,
    uiImageSrc: ui.uiImageSrc,
    uiWouldUsePlaceholderPath: ui.usesPlaceholderPath,
    uiWouldUseUnsplash: ui.usesUnsplash,
    rootCause,
  });
}

function buildArchitectureSection(
  inventory: SupplierInventoryRow[],
  products: ProductAuditRow[],
): string {
  const total = products.length;
  const withImg = products.filter((p) => p.imageUrlPresent).length;
  const coverage = total > 0 ? (withImg / total) * 100 : 0;

  const byPath = new Map<ListingPath, ProductAuditRow[]>();
  for (const p of products) {
    const l = byPath.get(p.listingPath) ?? [];
    l.push(p);
    byPath.set(p.listingPath, l);
  }

  const hdLowes = products.filter((p) => {
    const inv = inventory.find((i) => i.supplierId === p.supplierId);
    return inv?.adapterPrefix === "home_depot" || inv?.adapterPrefix === "lowes";
  });
  const siteSearch = products.filter((p) => {
    const inv = inventory.find((i) => i.supplierId === p.supplierId);
    return (
      p.listingPath === "GENERIC_DOMAIN" ||
      (inv?.adapterPrefix &&
        inv.adapterPrefix !== "home_depot" &&
        inv.adapterPrefix !== "lowes")
    );
  });
  const cap = products.filter((p) => p.listingPath === "CAPABILITY_ONLY");

  const placeholderUi = products.filter((p) => p.uiWouldUsePlaceholderPath).length;
  const unsplashUi = products.filter((p) => p.uiWouldUseUnsplash).length;

  let s = `# Architecture recommendation (from audit data)\n\n`;
  s += `## Do we have an image problem?\n\n`;
  s += coverage >= 85
    ? `Coverage is **${coverage.toFixed(1)}%** at the \`imageUrl\` layer — moderate, but UI effective coverage is lower due to placeholder/Unsplash fallbacks.\n\n`
    : `Coverage is **${coverage.toFixed(1)}%** — **yes**, there is a meaningful marketplace image problem.\n\n`;

  s += `## Concentration\n\n`;
  if (hdLowes.length > 0) {
    const img = hdLowes.filter((p) => p.imageUrlPresent).length;
    s += `- Big-box (Home Depot / Lowe's): ${pct(img, hdLowes.length)} imageUrl coverage (${hdLowes.length} records)\n`;
  }
  if (siteSearch.length > 0) {
    const img = siteSearch.filter((p) => p.imageUrlPresent).length;
    s += `- Registry site-search + generic domain: ${pct(img, siteSearch.length)} (${siteSearch.length} records)\n`;
  }
  if (cap.length > 0) {
    s += `- Capability-only cards: **0%** imageUrl by design (${cap.length} records)\n`;
  }
  s += `\n## UI layer\n\n`;
  s += `- ${placeholderUi} records resolve to missing \`/placeholder.png\` (404 → SVG fallback)\n`;
  s += `- ${unsplashUi} records use deprecated Unsplash URL\n\n`;

  s += `## Would fixing pipelines be enough?\n\n`;
  s += `| Fix | Est. impact |\n|-----|-------------|\n`;
  s += `| Remove /placeholder.png; pass null to ImageWithFallback | All ${placeholderUi} UI fallbacks |\n`;
  s += `| Allow listings without images in UI (already true for HD/Lowe's) | Better cards for null imageUrl |\n`;
  s += `| Relax searchSupplierSite image gate OR enrich before gate | More listings + fewer silent drops |\n`;
  s += `| Enable extractImagesFromPage for SRS/QXO/Lansing/Gulfeagle | Distributor imageUrl rate |\n`;
  s += `| Replace capability Unsplash | ${unsplashUi} capability rows |\n\n`;

  s += `## Image enrichment system?\n\n`;
  const missingAfterPipeline =
    products.filter((p) => !p.imageUrlPresent && p.listingPath !== "CAPABILITY_ONLY").length +
    cap.length;
  s += `After pipeline fixes, **~${cap.length} capability listings** still lack real product images. `;
  s += `Enrichment (og:image scrape, Google Images with relaxed domain rules, CDN cache) would address `;
  s += `**~${missingAfterPipeline}** of **${total}** records (${pct(missingAfterPipeline, total)}). `;
  s += `Capability data needs either curated images in DB or per-brand artwork, not Serp product search alone.\n\n`;

  s += `## Long-term architecture\n\n`;
  s += `1. **Unified \`ProductListing\` service** — single paginated API with \`imageUrl\`, \`imageStatus\`, \`enrichmentAttempted\`.\n`;
  s += `2. **Policy per channel** — \`REQUIRES_IMAGE\` vs \`ALLOWS_NULL\` explicit per adapter.\n`;
  s += `3. **Image enrichment worker** — async backfill for null imageUrl; store in object storage.\n`;
  s += `4. **UI** — never reference missing static assets; optional category icon by \`categoryId\`.\n`;
  s += `5. **Observability** — run this audit in CI weekly; alert if coverage drops.\n`;

  return s;
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    try {
      const prisma = getPrisma();
      await prisma.$disconnect();
    } catch {
      /* ignore */
    }
  });
