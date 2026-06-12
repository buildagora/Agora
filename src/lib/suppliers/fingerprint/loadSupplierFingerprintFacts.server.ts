import type { SupplierFingerprint } from "@prisma/client";
import { getPrisma } from "@/lib/db.server";
import type {
  LegacyStrategySnapshot,
  SupplierFingerprintFacts,
} from "./types";

export function mapFingerprintRowToFacts(
  supplierId: string,
  row: SupplierFingerprint
): SupplierFingerprintFacts {
  return {
    supplierId,
    canonicalDomain: row.canonicalDomain,
    detectedPlatform: row.detectedPlatform,
    platformDetectionConfidence: row.platformDetectionConfidence,
    platformDetectionSource: row.platformDetectionSource,
    platformAccessStatus: row.platformAccessStatus,
    platformBindingId: row.platformBindingId,
    platformBindingValid: row.platformBindingValid,
    hasPublicApi: row.hasPublicApi,
    publicApiAccessStatus: row.publicApiAccessStatus,
    publicApiEndpoint: row.publicApiEndpoint,
    hasSchemaMarkup: row.hasSchemaMarkup,
    hasSitemap: row.hasSitemap,
    sitemapUrls: row.sitemapUrls,
    renderingType: row.renderingType,
    isSPA: row.isSPA,
    antiBotRisk: row.antiBotRisk,
    demandPriority: row.demandPriority,
    demandScore: row.demandScore,
    allowSerpFallback: row.allowSerpFallback,
    fingerprintStatus: row.fingerprintStatus,
    lastFingerprintedAt: row.lastFingerprintedAt,
    legacySnapshot: (row.legacySnapshot ?? {
      matchKind: "generic_domain",
    }) as LegacyStrategySnapshot,
    notes: row.notes,
  };
}

/**
 * Load persisted fingerprint facts for a supplier (read-only).
 * Returns null when no row exists — never throws for a missing fingerprint.
 */
export async function loadSupplierFingerprintFacts(
  supplierId: string
): Promise<SupplierFingerprintFacts | null> {
  const prisma = getPrisma();
  const row = await prisma.supplierFingerprint.findUnique({
    where: { supplierId },
  });
  if (!row) return null;
  return mapFingerprintRowToFacts(supplierId, row);
}
