import type { SupplierFingerprint } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { getPrisma } from "@/lib/db.server";
import type {
  LegacyStrategySnapshot,
  SupplierFingerprintFacts,
} from "./types";

let loggedFingerprintStoreUnavailable = false;

function isFingerprintStoreUnavailable(err: unknown): boolean {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    // P2021: table does not exist; P2022: column does not exist (partial migration)
    if (err.code === "P2021" || err.code === "P2022") return true;
  }
  if (
    err instanceof Error &&
    /does not exist in the current database/i.test(err.message)
  ) {
    return true;
  }
  return false;
}

function logFingerprintStoreUnavailableOnce(): void {
  if (loggedFingerprintStoreUnavailable) return;
  loggedFingerprintStoreUnavailable = true;
  console.warn(
    "[fingerprint] SupplierFingerprint store unavailable; treating as missing fingerprint"
  );
}

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
 * Returns null when no row exists or the fingerprint store is unavailable.
 */
export async function loadSupplierFingerprintFacts(
  supplierId: string
): Promise<SupplierFingerprintFacts | null> {
  const prisma = getPrisma();
  try {
    const row = await prisma.supplierFingerprint.findUnique({
      where: { supplierId },
    });
    if (!row) return null;
    return mapFingerprintRowToFacts(supplierId, row);
  } catch (err) {
    if (isFingerprintStoreUnavailable(err)) {
      logFingerprintStoreUnavailableOnce();
      return null;
    }
    throw err;
  }
}
