/**
 * One-time data migration:
 *   1. Normalize SupplierCategoryLink.categoryId to canonical ids
 *   2. Normalize SupplierCapability.categoryId via CAPABILITY_CATEGORY_ALIASES
 *   3. Set Supplier.primaryCategoryId from links + curated overrides
 *   4. Sync legacy Supplier.category to canonical primaryCategoryId (for seed dumps)
 *
 * Usage:
 *   npx tsx scripts/backfill-supplier-primary-category.ts
 *   npx tsx scripts/backfill-supplier-primary-category.ts --dry-run
 */

import { getPrisma } from "../src/lib/db.server";
import {
  CAPABILITY_CATEGORY_ALIASES,
  normalizeToCanonicalCategoryId,
  pickPrimaryCategoryId,
  SUPPLIER_PRIMARY_OVERRIDES,
} from "../src/lib/suppliers/categoryTaxonomy";

const prisma = getPrisma();
const dryRun = process.argv.includes("--dry-run");

async function main() {
  console.log(`[backfill-primary-category] dryRun=${dryRun}`);

  // --- Normalize category links ---
  const links = await prisma.supplierCategoryLink.findMany({
    select: { id: true, categoryId: true, supplierId: true },
  });
  let linksUpdated = 0;
  for (const link of links) {
    const canonical = normalizeToCanonicalCategoryId(link.categoryId);
    if (!canonical || canonical === link.categoryId) continue;
    if (!dryRun) {
      await prisma.supplierCategoryLink.update({
        where: { id: link.id },
        data: { categoryId: canonical },
      });
    }
    linksUpdated++;
  }
  console.log(`Category links normalized: ${linksUpdated}`);

  // --- Normalize capability category ids ---
  const capabilities = await prisma.supplierCapability.findMany({
    select: { id: true, categoryId: true },
  });
  let capsUpdated = 0;
  for (const cap of capabilities) {
    const canonical =
      normalizeToCanonicalCategoryId(cap.categoryId) ??
      (CAPABILITY_CATEGORY_ALIASES[cap.categoryId.toLowerCase()] as
        | ReturnType<typeof normalizeToCanonicalCategoryId>
        | undefined);
    if (!canonical || canonical === cap.categoryId) continue;
    if (!dryRun) {
      await prisma.supplierCapability.update({
        where: { id: cap.id },
        data: { categoryId: canonical },
      });
    }
    capsUpdated++;
  }
  console.log(`Capability rows normalized: ${capsUpdated}`);

  // --- Primary category per supplier ---
  const suppliers = await prisma.supplier.findMany({
    include: {
      categoryLinks: { select: { categoryId: true } },
    },
  });

  const capabilityCountsBySupplier = new Map<string, Record<string, number>>();
  const capGroups = await prisma.supplierCapability.groupBy({
    by: ["supplierId", "categoryId"],
    _count: { _all: true },
  });
  for (const g of capGroups) {
    if (!capabilityCountsBySupplier.has(g.supplierId)) {
      capabilityCountsBySupplier.set(g.supplierId, {});
    }
    capabilityCountsBySupplier.get(g.supplierId)![g.categoryId] = g._count._all;
  }

  let suppliersUpdated = 0;
  const curatedIds = Object.keys(SUPPLIER_PRIMARY_OVERRIDES);

  for (const supplier of suppliers) {
    const primary = pickPrimaryCategoryId({
      supplierId: supplier.id,
      linkCategoryIds: supplier.categoryLinks.map((l) => l.categoryId),
      legacyCategory: supplier.category,
      capabilityCategoryCounts: capabilityCountsBySupplier.get(supplier.id),
    });

    const needsUpdate =
      supplier.primaryCategoryId !== primary || supplier.category !== primary;

    if (!needsUpdate) continue;

    if (!dryRun) {
      await prisma.supplier.update({
        where: { id: supplier.id },
        data: {
          primaryCategoryId: primary,
          category: primary,
        },
      });
    }
    suppliersUpdated++;

    if (curatedIds.includes(supplier.id)) {
      console.log(
        `  curated ${supplier.id}: primary=${primary} (was category=${supplier.category})`
      );
    }
  }

  console.log(`Suppliers updated: ${suppliersUpdated} / ${suppliers.length}`);

  if (dryRun) {
    console.log("Dry run — no writes performed.");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
