/**
 * Log suppliers dropped from search cards due to missing coordinates.
 */
import type { ExtractionStrategy } from "@prisma/client";
import { getPrisma } from "@/lib/db.server";
import { loadSupplierFingerprintFacts } from "@/lib/suppliers/fingerprint/loadSupplierFingerprintFacts.server";
import { resolveExtractionStrategy } from "@/lib/suppliers/routing/resolveExtractionStrategy";
import type { CapabilitySearchResult } from "./capabilitySearch";
import { logSupplierSearchGeoExcluded } from "./searchCardTelemetry";

export async function logGeoExcludedCapabilityMatches(args: {
  query: string;
  supplierIds: string[];
  capabilityScoreBySupplier: Map<string, number>;
  categoryIdBySupplier: Map<string, string>;
  loadFacts?: typeof loadSupplierFingerprintFacts;
}): Promise<void> {
  if (args.supplierIds.length === 0) return;

  try {
    const prisma = getPrisma();
    const loadFacts = args.loadFacts ?? loadSupplierFingerprintFacts;

    const rows = await prisma.supplier.findMany({
      where: {
        id: { in: args.supplierIds },
        OR: [{ latitude: null }, { longitude: null }],
      },
      select: {
        id: true,
        name: true,
        city: true,
        state: true,
      },
    });

    for (const row of rows) {
      const facts = await loadFacts(row.id);
      let routerPrimaryStrategy: ExtractionStrategy | undefined;
      if (facts) {
        routerPrimaryStrategy = resolveExtractionStrategy({
          supplierId: row.id,
          canonicalDomain: facts.canonicalDomain,
          facts,
          legacySnapshot: facts.legacySnapshot,
        }).primaryStrategy;
      }

      logSupplierSearchGeoExcluded({
        event: "supplier_search_geo_excluded",
        supplierId: row.id,
        name: row.name,
        query: args.query,
        categoryId: args.categoryIdBySupplier.get(row.id) ?? "",
        capabilityScore: args.capabilityScoreBySupplier.get(row.id) ?? 0,
        city: row.city,
        state: row.state,
        hasFingerprint: facts != null,
        routerPrimaryStrategy,
      });
    }
  } catch (err) {
    console.warn(
      "[geo_exclusion_telemetry] skipped:",
      err instanceof Error ? err.message : String(err)
    );
  }
}

export function buildCategoryIdBySupplier(
  matches: CapabilitySearchResult[]
): Map<string, string> {
  const out = new Map<string, string>();
  for (const match of matches) {
    if (!out.has(match.supplierId)) {
      out.set(match.supplierId, match.categoryId);
    }
  }
  return out;
}
