/**
 * Phase 8E.0 — supplier readiness report foundation (CLI / JSON).
 *
 *   npm run fingerprint:supplier-readiness
 *   npm run fingerprint:supplier-readiness -- --json
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { getPrisma } from "../../src/lib/db.server";
import { loadSupplierFingerprintFacts } from "../../src/lib/suppliers/fingerprint/loadSupplierFingerprintFacts.server";
import { ROUTER_PROMOTED_SUPPLIERS } from "./phase6bProvenCohortParity";
import {
  getRouterExecutionMode,
  getSupplierPromotionState,
} from "../../src/lib/suppliers/routing/routerExecutionMode";

process.env.FINGERPRINT_ROUTER_EXECUTION_MODE = "promoted";
process.env.FINGERPRINT_ROUTER_PROMOTED_SUPPLIERS =
  ROUTER_PROMOTED_SUPPLIERS.join(",");

export type SupplierReadinessRow = {
  supplierId: string;
  domainPresent: boolean;
  coordinatesPresent: boolean;
  fingerprintStatus: string | null;
  promotionState: ReturnType<typeof getSupplierPromotionState>;
};

async function main() {
  const jsonOut = process.argv.includes("--json");
  const prisma = getPrisma();

  const suppliers = await prisma.supplier.findMany({
    select: {
      id: true,
      domain: true,
      latitude: true,
      longitude: true,
    },
    orderBy: { id: "asc" },
  });

  const rows: SupplierReadinessRow[] = [];

  for (const supplier of suppliers) {
    const facts = await loadSupplierFingerprintFacts(supplier.id);
    const domainPresent = Boolean(
      supplier.domain?.trim() || facts?.canonicalDomain?.trim()
    );
    const coordinatesPresent =
      supplier.latitude != null && supplier.longitude != null;

    rows.push({
      supplierId: supplier.id,
      domainPresent,
      coordinatesPresent,
      fingerprintStatus: facts?.fingerprintStatus ?? null,
      promotionState: getSupplierPromotionState(supplier.id),
    });
  }

  const report = {
    generatedAt: new Date().toISOString(),
    executionMode: getRouterExecutionMode(),
    supplierCount: rows.length,
    summary: {
      domainPresent: rows.filter((r) => r.domainPresent).length,
      coordinatesPresent: rows.filter((r) => r.coordinatesPresent).length,
      fingerprintSuccess: rows.filter((r) => r.fingerprintStatus === "SUCCESS")
        .length,
      promotionStatePromoted: rows.filter(
        (r) => r.promotionState === "promoted"
      ).length,
    },
    rows,
  };

  const outDir = join(process.cwd(), "scripts/output/fingerprint");
  await mkdir(outDir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const outPath = join(outDir, `supplier-readiness-${ts}.json`);
  await writeFile(outPath, JSON.stringify(report, null, 2));

  if (jsonOut) {
    console.log(JSON.stringify(report, null, 2));
    await prisma.$disconnect();
    return;
  }

  console.log("\n=== Supplier Readiness Report ===\n");
  console.log(`Written: ${outPath}\n`);
  console.log(`Execution mode: ${report.executionMode}`);
  console.log(`Suppliers: ${report.supplierCount}`);
  console.log(JSON.stringify(report.summary, null, 2));
  console.log(
    "\nSample (first 5 promoted or domain-present):\n" +
      "supplierId | domain | coords | fingerprint | promotionState"
  );
  console.log("-".repeat(72));
  const sample = rows.filter(
    (r) => r.promotionState === "promoted" || r.domainPresent
  );
  for (const r of sample.slice(0, 8)) {
    console.log(
      [
        r.supplierId,
        r.domainPresent ? "Y" : "N",
        r.coordinatesPresent ? "Y" : "N",
        r.fingerprintStatus ?? "-",
        r.promotionState,
      ].join(" | ")
    );
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
