/**
 * Phase 11.3A validation — product counts, pagination, archetypes.
 * Run: npx tsx scripts/validation/storefront-phase11.3a.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fetchStorefrontCatalogPage } from "@/lib/search/storefront/fetchStorefrontCatalogPage.server";
import { resolveStorefrontArchetype } from "@/lib/search/storefront/resolveStorefrontArchetype";
import { lookupStorefrontTier } from "@/lib/search/storefront/resolveStorefrontTier";
import { STOREFRONT_INITIAL_PAGE_SIZE } from "@/lib/search/storefront/storefrontCatalogConstants";

const QUERY = "asphalt shingles";
const SUPPLIERS = [
  { id: "home_depot_hsv", label: "Home Depot", tier: "READY" as const },
  { id: "lowes_hsv", label: "Lowe's", tier: "READY" as const },
  { id: "ferguson_plumbing_hsv", label: "Ferguson", tier: "READY" as const },
  { id: "abc_supply_hsv", label: "ABC Supply", tier: "READY" as const },
  { id: "floor_decor_hsv", label: "Floor & Decor", tier: "READY" as const },
  { id: "grainger_hsv", label: "Grainger", tier: "CAPABILITY" as const },
  { id: "gulfeagle_hsv", label: "Gulfeagle", tier: "PARTIAL" as const },
  { id: "srs_hsv", label: "SRS", tier: "PARTIAL" as const },
  { id: "lansing_hsv", label: "Lansing", tier: "PARTIAL" as const },
];

type ValidationRow = {
  supplierId: string;
  label: string;
  tier: string;
  archetype: string;
  page1Count: number;
  page2Count: number;
  totalCount: number | null;
  hasMore: boolean;
  beforeBaseline: number;
};

async function validateSupplier(
  supplierId: string,
  label: string
): Promise<ValidationRow> {
  const tier = lookupStorefrontTier(supplierId);
  const archetype = resolveStorefrontArchetype(supplierId, tier);

  const page1 = await fetchStorefrontCatalogPage({
    supplierId,
    productSearchQuery: QUERY,
    page: 1,
    pageSize: STOREFRONT_INITIAL_PAGE_SIZE,
    logLabel: label,
  });

  let page2Count = 0;
  if (page1.pagination.hasMore) {
    const page2 = await fetchStorefrontCatalogPage({
      supplierId,
      productSearchQuery: QUERY,
      page: 2,
      pageSize: STOREFRONT_INITIAL_PAGE_SIZE,
      logLabel: label,
    });
    page2Count = page2.products.length;
  }

  return {
    supplierId,
    label,
    tier,
    archetype: archetype.archetype,
    page1Count: page1.products.length,
    page2Count,
    totalCount: page1.pagination.totalCount,
    hasMore: page1.pagination.hasMore,
    beforeBaseline: 6,
  };
}

async function main() {
  const outDir = join(process.cwd(), "scripts/output/validation/phase11.3a");
  mkdirSync(outDir, { recursive: true });

  console.log("\nPhase 11.3A — Storefront validation\n");
  console.log(`Query: "${QUERY}"\n`);

  const rows: ValidationRow[] = [];
  for (const s of SUPPLIERS) {
    process.stdout.write(`  ${s.label}… `);
    try {
      const row = await validateSupplier(s.id, s.label);
      rows.push(row);
      console.log(
        `page1=${row.page1Count} page2=${row.page2Count} hasMore=${row.hasMore} archetype=${row.archetype}`
      );
    } catch (err) {
      console.log(
        `ERROR: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  const md = [
    "# Phase 11.3A Validation",
    "",
    `Query: \`${QUERY}\``,
    "",
    "| Supplier | Tier | Archetype | Before | Page 1 | Page 2 | Total | Has More |",
    "|----------|------|-----------|--------|--------|--------|-------|----------|",
    ...rows.map(
      (r) =>
        `| ${r.label} | ${r.tier} | ${r.archetype} | ${r.beforeBaseline} | ${r.page1Count} | ${r.page2Count} | ${r.totalCount ?? "—"} | ${r.hasMore} |`
    ),
    "",
    "## Pagination",
    "",
    rows.some((r) => r.page2Count > 0)
      ? "Load More performs new retrievals (page 2 returned products)."
      : "Page 2 empty — may need live API keys or network.",
    "",
    "## Rollout recommendation",
    "",
    "READY suppliers with page1 ≥ 12 are production-ready for catalog browsing.",
    "CAPABILITY suppliers use capability storefront (no fake catalog).",
  ].join("\n");

  const jsonPath = join(outDir, "validation.json");
  const mdPath = join(outDir, "report.md");
  writeFileSync(jsonPath, JSON.stringify(rows, null, 2));
  writeFileSync(mdPath, md);
  console.log(`\nWrote ${jsonPath}`);
  console.log(`Wrote ${mdPath}\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
