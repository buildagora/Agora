/**
 * Audit suppliers missing latitude/longitude and report search-relevant metadata.
 *
 *   npm run audit:supplier-coordinates
 *   npm run audit:supplier-coordinates -- --json
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { getPrisma } from "../src/lib/db.server";
import { loadSupplierFingerprintFacts } from "../src/lib/suppliers/fingerprint/loadSupplierFingerprintFacts.server";
import { resolveExtractionStrategy } from "../src/lib/suppliers/routing/resolveExtractionStrategy";
import { isDirectExtractionStrategy } from "../src/lib/suppliers/routing/types";
import { PROVEN_V1_COHORT } from "./fingerprint/phase6bProvenCohortParity";

const OUTPUT_DIR = join(process.cwd(), "scripts/output");

export type SupplierCoordinateAuditRow = {
  supplierId: string;
  name: string;
  category: string | null;
  city: string | null;
  state: string | null;
  domain: string | null;
  primaryCategoryId: string | null;
  street: string | null;
  zip: string | null;
  latitude: number | null;
  longitude: number | null;
  hasCapabilityRows: boolean;
  capabilityCount: number;
  hasFingerprint: boolean;
  routerPrimaryStrategy: string;
  provenLiveStrategy: boolean;
  provenV1: boolean;
};

function parseArgs(argv: string[]): { json: boolean } {
  return { json: argv.includes("--json") };
}

function isProvenLiveStrategy(strategy: string): boolean {
  return (
    isDirectExtractionStrategy(strategy as never) &&
    strategy !== "PROBABILISTIC_CATEGORY_PROFILE"
  );
}

export async function auditMissingSupplierCoordinates(): Promise<{
  rows: SupplierCoordinateAuditRow[];
  withCapabilities: number;
  provenV1Missing: number;
}> {
  const prisma = getPrisma();

  const missing = await prisma.supplier.findMany({
    where: { OR: [{ latitude: null }, { longitude: null }] },
    orderBy: { id: "asc" },
    select: {
      id: true,
      name: true,
      category: true,
      city: true,
      state: true,
      domain: true,
      primaryCategoryId: true,
      latitude: true,
      longitude: true,
      street: true,
      zip: true,
    },
  });

  const capCounts = await prisma.supplierCapability.groupBy({
    by: ["supplierId"],
    _count: { _all: true },
  });
  const capMap = new Map(capCounts.map((c) => [c.supplierId, c._count._all]));

  const rows: SupplierCoordinateAuditRow[] = [];

  for (const s of missing) {
    const facts = await loadSupplierFingerprintFacts(s.id);
    let routerPrimaryStrategy = "(no fingerprint)";
    let provenLiveStrategy = false;

    if (facts) {
      const plan = resolveExtractionStrategy({
        supplierId: s.id,
        canonicalDomain: facts.canonicalDomain ?? s.domain,
        facts,
        legacySnapshot: facts.legacySnapshot,
      });
      routerPrimaryStrategy = plan.primaryStrategy;
      provenLiveStrategy = isProvenLiveStrategy(plan.primaryStrategy);
    }

    const capabilityCount = capMap.get(s.id) ?? 0;
    rows.push({
      supplierId: s.id,
      name: s.name,
      category: s.category,
      city: s.city,
      state: s.state,
      domain: s.domain,
      primaryCategoryId: s.primaryCategoryId,
      street: s.street,
      zip: s.zip,
      latitude: s.latitude,
      longitude: s.longitude,
      hasCapabilityRows: capabilityCount > 0,
      capabilityCount,
      hasFingerprint: facts != null,
      routerPrimaryStrategy,
      provenLiveStrategy,
      provenV1: (PROVEN_V1_COHORT as readonly string[]).includes(s.id),
    });
  }

  return {
    rows,
    withCapabilities: rows.filter((r) => r.hasCapabilityRows).length,
    provenV1Missing: rows.filter((r) => r.provenV1).length,
  };
}

async function main() {
  const { json } = parseArgs(process.argv);
  const result = await auditMissingSupplierCoordinates();

  await mkdir(OUTPUT_DIR, { recursive: true });
  const outPath = join(OUTPUT_DIR, "supplier-coordinate-audit.json");
  await writeFile(outPath, JSON.stringify(result, null, 2));

  if (json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`\nSuppliers missing coordinates: ${result.rows.length}`);
  console.log(`  with capability rows: ${result.withCapabilities}`);
  console.log(`  proven-v1 cohort:     ${result.provenV1Missing}`);
  console.log(`\nWritten: ${outPath}\n`);

  for (const row of result.rows) {
    console.log(
      [
        row.supplierId,
        row.city && row.state ? `${row.city}, ${row.state}` : "—",
        `caps=${row.capabilityCount}`,
        row.routerPrimaryStrategy,
        row.provenLiveStrategy ? "live" : "—",
        row.provenV1 ? "proven-v1" : "",
      ]
        .filter(Boolean)
        .join(" | ")
    );
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await getPrisma().$disconnect();
  });
