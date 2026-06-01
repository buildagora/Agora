/**
 * Capability enrichment crawler (Gemini extraction).
 *
 * For each Supplier with categories tagged, asks Gemini (with Google Search
 * grounding) to list the brands and product lines the supplier carries.
 * Writes the results as SupplierCapability rows.
 *
 * Why this approach: an earlier title-regex version of this crawler matched
 * <1% of suppliers because most local supplier sites don't surface brand
 * names in page titles. Gemini can use prior knowledge of distributor brand
 * carriages plus Google Search to fill in coverage.
 *
 * Usage:
 *   npx tsx -r dotenv/config scripts/crawl-supplier-capabilities.ts dotenv_config_path=.env.local
 *
 * Flags:
 *   --dry-run         Don't write to DB; print what would be inserted.
 *   --limit N         Crawl at most N suppliers.
 *   --supplier ID     Crawl just this one supplier.
 *   --force           Re-crawl suppliers that already have capability rows.
 *
 * Cost: each supplier = one Gemini call w/ Google Search grounding (~$0.005
 * with current pricing). 100 suppliers ≈ $0.50.
 */

import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

import {
  extractSupplierCapabilities,
  type ExtractedCapability,
} from "../src/lib/ai/extractSupplierCapabilities";

type Args = {
  dryRun: boolean;
  limit: number | null;
  supplierFilter: string | null;
  force: boolean;
};

function parseArgs(): Args {
  const out: Args = {
    dryRun: false,
    limit: null,
    supplierFilter: null,
    force: false,
  };
  for (let i = 2; i < process.argv.length; i++) {
    const k = process.argv[i];
    if (k === "--dry-run") out.dryRun = true;
    else if (k === "--force") out.force = true;
    else if (k === "--limit") out.limit = parseInt(process.argv[++i] ?? "0", 10) || null;
    else if (k === "--supplier") out.supplierFilter = process.argv[++i] ?? null;
  }
  return out;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function normCat(s: string): string {
  return s.toLowerCase().trim();
}

/**
 * Broad-catalog retailers (Home Depot, Lowes) are handled by their adapters'
 * live Google Shopping query. Their inventories are too large to meaningfully
 * model as SupplierCapability rows, and live search gives better-quality,
 * current-pricing results anyway. Skip them in the crawler.
 *
 * Other adapter-backed suppliers (Ferguson, Grainger, Johnstone, ABC Supply,
 * etc.) use site-scoped search — they benefit from capability rows because
 * the rows act as a fast pre-filter at search time.
 */
const BROAD_CATALOG_PREFIXES = ["home_depot", "lowes"];

function isBroadCatalogSupplier(supplierId: string): boolean {
  return BROAD_CATALOG_PREFIXES.some((p) => supplierId.startsWith(p));
}

type RowToWrite = {
  supplierId: string;
  categoryId: string;
  subcategory: string;
  brand: string;
  productLine: string | null;
  sourceUrl: string;
};

/**
 * Expand a list of extracted capabilities into the row set we'll write.
 * Each (brand, productType) gets:
 *   - one anchor row with productLine = null
 *   - one additional row per known productLine
 *
 * This matches the existing data shape: most rows are brand-level (productLine
 * null); productLine rows act as stronger evidence for specific queries.
 */
function expandToRows(
  supplierId: string,
  domain: string | null,
  caps: ExtractedCapability[]
): RowToWrite[] {
  const sourceUrl = domain ? `https://${domain}` : "https://agora-extraction";
  const rows: RowToWrite[] = [];
  for (const cap of caps) {
    rows.push({
      supplierId,
      categoryId: cap.categoryId,
      subcategory: cap.productType,
      brand: cap.brand,
      productLine: null,
      sourceUrl,
    });
    for (const line of cap.productLines) {
      rows.push({
        supplierId,
        categoryId: cap.categoryId,
        subcategory: cap.productType,
        brand: cap.brand,
        productLine: line,
        sourceUrl,
      });
    }
  }
  return rows;
}

async function main() {
  const args = parseArgs();
  console.log("[crawl] args:", args);

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const db = new PrismaClient({ adapter: new PrismaPg(pool) });

  const where: any = {};
  if (args.supplierFilter) where.id = args.supplierFilter;

  // By default, skip suppliers that already have any capability rows.
  if (!args.force && !args.supplierFilter) {
    const enriched = await db.supplierCapability.findMany({
      distinct: ["supplierId"],
      select: { supplierId: true },
    });
    where.id = { notIn: enriched.map((r) => r.supplierId) };
  }

  const suppliers = await db.supplier.findMany({
    where,
    select: {
      id: true,
      name: true,
      domain: true,
      city: true,
      state: true,
      category: true,
      categoryLinks: { select: { categoryId: true } },
    },
    take: args.limit ?? undefined,
  });

  console.log(`[crawl] processing ${suppliers.length} suppliers`);

  let totalRows = 0;
  let suppliersWithRows = 0;
  let totalUsageIn = 0;
  let totalUsageOut = 0;

  for (const supplier of suppliers) {
    if (isBroadCatalogSupplier(supplier.id)) {
      console.log(`\n→ ${supplier.name} (${supplier.id})  [skip: broad-catalog retailer, live adapter handles it]`);
      continue;
    }

    const categoryIds = Array.from(
      new Set(
        supplier.categoryLinks.map((l) => normCat(l.categoryId)).filter(Boolean)
      )
    );

    console.log(`\n→ ${supplier.name} (${supplier.id})  cats=[${categoryIds.join(",")}]`);

    let extracted: ExtractedCapability[] = [];
    try {
      const result = await extractSupplierCapabilities({
        supplier: {
          id: supplier.id,
          name: supplier.name,
          domain: supplier.domain,
          city: supplier.city,
          state: supplier.state,
          categoryIds,
        },
      });
      extracted = result.capabilities;
      if (result.usage) {
        totalUsageIn += result.usage.input ?? 0;
        totalUsageOut += result.usage.output ?? 0;
      }
    } catch (err: any) {
      console.error(`  [err] gemini extract failed: ${err?.message ?? err}`);
      continue;
    }

    if (extracted.length === 0) {
      console.log(`  [empty] no capabilities extracted`);
      continue;
    }

    const rows = expandToRows(supplier.id, supplier.domain, extracted);
    console.log(`  [extracted] ${extracted.length} brand/productType combos → ${rows.length} rows`);

    if (args.dryRun) {
      for (const r of rows.slice(0, 8)) {
        console.log(`    [dry] ${r.categoryId} / ${r.subcategory} / ${r.brand}${r.productLine ? " / " + r.productLine : ""}`);
      }
      if (rows.length > 8) console.log(`    [dry] ... +${rows.length - 8} more`);
      totalRows += rows.length;
      suppliersWithRows++;
    } else {
      let wroteThisSupplier = 0;
      for (const r of rows) {
        try {
          await db.supplierCapability.create({
            data: {
              supplierId: r.supplierId,
              categoryId: r.categoryId,
              subcategory: r.subcategory,
              brand: r.brand,
              productLine: r.productLine,
              sourceUrl: r.sourceUrl,
              confidence: "MEDIUM",
              notes: "Gemini extraction",
            },
          });
          wroteThisSupplier++;
        } catch (err: any) {
          if (err?.code !== "P2002") {
            console.error(`    [write-err] ${r.brand}/${r.productLine ?? "—"}: ${err?.message ?? err}`);
          }
        }
      }
      console.log(`  [wrote] ${wroteThisSupplier} rows`);
      totalRows += wroteThisSupplier;
      if (wroteThisSupplier > 0) suppliersWithRows++;
    }

    // Be gentle on Gemini's free-tier RPM; cache layer is for SerpAPI not Gemini.
    await sleep(500);
  }

  console.log(
    `\n[done] suppliers=${suppliers.length}, with-rows=${suppliersWithRows}, rows-written=${totalRows}`
  );
  console.log(
    `[gemini] tokens in=${totalUsageIn}, out=${totalUsageOut}`
  );

  await db.$disconnect();
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
