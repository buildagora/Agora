/**
 * Regression guard for critical supplier coordinates and domains.
 *
 *   npm run audit:critical-suppliers
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { getPrisma } from "../src/lib/db.server";
import { loadSupplierFingerprintFacts } from "../src/lib/suppliers/fingerprint/loadSupplierFingerprintFacts.server";
import { resolveExtractionStrategy } from "../src/lib/suppliers/routing/resolveExtractionStrategy";
import { SCHEMA_OR_SITEMAP_ALLOWLIST } from "../src/lib/suppliers/routing/resolveSchemaOrSitemapExecution";
import { isDirectExtractionStrategy } from "../src/lib/suppliers/routing/types";
import { PROVEN_V1_COHORT } from "./fingerprint/phase6bProvenCohortParity";
import {
  SUPPLIER_COORDINATE_PATCHES,
  SUPPLIER_DOMAIN_PATCHES,
} from "./patch-supplier-coordinates";

const CRITICAL_DOMAIN_EXPECTATIONS: Record<string, string> = {
  abc_supply_hsv: "abcsupply.com",
};

const COORD_EPS = 0.0001;

function coordsMatch(
  lat: number | null,
  lng: number | null,
  expectedLat: number,
  expectedLng: number
): boolean {
  if (lat == null || lng == null) return false;
  return (
    Math.abs(lat - expectedLat) < COORD_EPS &&
    Math.abs(lng - expectedLng) < COORD_EPS
  );
}

function fail(message: string, failures: string[]): void {
  failures.push(message);
  console.error(`FAIL: ${message}`);
}

function pass(message: string): void {
  console.log(`PASS: ${message}`);
}

export async function auditCriticalSuppliers(): Promise<{
  passCount: number;
  failCount: number;
  failures: string[];
}> {
  const prisma = getPrisma();
  const failures: string[] = [];
  let passCount = 0;

  const recordPass = (message: string) => {
    passCount++;
    pass(message);
  };

  // --- Domain patches (e.g. ABC Supply) ---
  for (const patch of SUPPLIER_DOMAIN_PATCHES) {
    const row = await prisma.supplier.findUnique({
      where: { id: patch.supplierId },
      select: { id: true, domain: true },
    });
    if (!row) {
      fail(`Missing supplier ${patch.supplierId} (domain patch)`, failures);
      continue;
    }
    const expected = patch.domain.toLowerCase();
    if ((row.domain ?? "").toLowerCase() !== expected) {
      fail(
        `${patch.supplierId} domain=${row.domain ?? "null"} expected ${expected}`,
        failures
      );
    } else {
      recordPass(`${patch.supplierId} domain=${expected}`);
    }
  }

  for (const [supplierId, domain] of Object.entries(CRITICAL_DOMAIN_EXPECTATIONS)) {
    const row = await prisma.supplier.findUnique({
      where: { id: supplierId },
      select: { domain: true },
    });
    if (!row) {
      fail(`Missing critical supplier ${supplierId}`, failures);
      continue;
    }
    if ((row.domain ?? "").toLowerCase() !== domain) {
      fail(`${supplierId} domain=${row.domain ?? "null"} expected ${domain}`, failures);
    } else {
      recordPass(`${supplierId} critical domain=${domain}`);
    }
  }

  // --- Proven-v1 cohort coordinates ---
  for (const supplierId of PROVEN_V1_COHORT) {
    const row = await prisma.supplier.findUnique({
      where: { id: supplierId },
      select: { latitude: true, longitude: true },
    });
    if (!row) {
      fail(`Missing proven-v1 supplier ${supplierId}`, failures);
      continue;
    }
    if (row.latitude == null || row.longitude == null) {
      fail(`proven-v1 ${supplierId} missing coordinates`, failures);
    } else {
      recordPass(`proven-v1 ${supplierId} has coordinates`);
    }
  }

  // --- Verified patch coordinates must match DB (no drift / city-centroid regression) ---
  for (const patch of SUPPLIER_COORDINATE_PATCHES) {
    if (patch.precision === "unresolved_missing_address") continue;

    const row = await prisma.supplier.findUnique({
      where: { id: patch.supplierId },
      select: { latitude: true, longitude: true },
    });
    if (!row) {
      fail(`Missing patched supplier ${patch.supplierId}`, failures);
      continue;
    }
    if (
      !coordsMatch(row.latitude, row.longitude, patch.latitude, patch.longitude)
    ) {
      fail(
        `${patch.supplierId} coords=${row.latitude},${row.longitude} expected verified patch ${patch.latitude},${patch.longitude} (${patch.precision})`,
        failures
      );
    } else {
      recordPass(
        `${patch.supplierId} verified coords (${patch.precision})`
      );
    }
  }

  // --- Capability rows require coordinates (local geo search) ---
  const capGroups = await prisma.supplierCapability.groupBy({
    by: ["supplierId"],
    _count: { _all: true },
  });
  for (const group of capGroups) {
    const row = await prisma.supplier.findUnique({
      where: { id: group.supplierId },
      select: { id: true, latitude: true, longitude: true },
    });
    if (!row) continue;
    if (row.latitude == null || row.longitude == null) {
      fail(
        `${row.id} has ${group._count._all} capability rows but null coordinates`,
        failures
      );
    }
  }
  if (failures.filter((f) => f.includes("capability rows")).length === 0) {
    recordPass("all suppliers with capability rows have coordinates");
  }

  // --- Router/schema candidates need domain when strategy requires it ---
  const routerCandidates = new Set<string>([
    ...PROVEN_V1_COHORT,
    ...SCHEMA_OR_SITEMAP_ALLOWLIST,
  ]);
  for (const supplierId of routerCandidates) {
    const row = await prisma.supplier.findUnique({
      where: { id: supplierId },
      select: { domain: true },
    });
    if (!row) continue;

    const facts = await loadSupplierFingerprintFacts(supplierId);
    if (!facts) continue;

    const plan = resolveExtractionStrategy({
      supplierId,
      canonicalDomain: facts.canonicalDomain ?? row.domain,
      facts,
      legacySnapshot: facts.legacySnapshot,
    });

    const needsDomain =
      isDirectExtractionStrategy(plan.primaryStrategy) &&
      plan.primaryStrategy !== "PROBABILISTIC_CATEGORY_PROFILE" &&
      plan.primaryStrategy !== "PLATFORM_API";

    if (needsDomain && !row.domain?.trim() && !facts.canonicalDomain?.trim()) {
      fail(
        `${supplierId} router primary=${plan.primaryStrategy} but domain is null`,
        failures
      );
    }
  }
  if (
    failures.filter((f) => f.includes("router primary")).length === 0
  ) {
    recordPass("router/schema candidates have domain when required");
  }

  // --- No duplicate supplier IDs ---
  const dupes = await prisma.$queryRaw<{ id: string; count: bigint }[]>`
    SELECT id, COUNT(*)::bigint AS count
    FROM "Supplier"
    GROUP BY id
    HAVING COUNT(*) > 1
  `;
  if (dupes.length > 0) {
    for (const d of dupes) {
      fail(`duplicate supplier id ${d.id} (${d.count} rows)`, failures);
    }
  } else {
    recordPass("no duplicate supplier IDs");
  }

  return { passCount, failCount: failures.length, failures };
}

async function main() {
  console.log("\nCritical supplier audit\n");
  const result = await auditCriticalSuppliers();
  console.log(`\n${result.passCount} passed, ${result.failCount} failed\n`);
  if (result.failCount > 0) {
    process.exit(1);
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
