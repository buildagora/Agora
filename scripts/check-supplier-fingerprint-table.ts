/**
 * Read-only diagnostic: SupplierFingerprint table + migration record.
 *
 * Local:
 *   npm run fingerprint:check
 *
 * Production (loads .env.production.local exclusively):
 *   npm run prod:fingerprint:check
 */
import { config as loadEnv } from "dotenv";
import { loadProductionEnv, printProductionEnvTarget } from "./lib/loadProductionEnv";

const FINGERPRINT_MIGRATION = "20260604120000_add_supplier_fingerprint";
const FINGERPRINT_TABLE = "SupplierFingerprint";
const useProduction = process.argv.includes("--production");

/** to_regclass() ::text returns quoted mixed-case names as '"SupplierFingerprint"'. */
function normalizeRegclassName(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

async function main() {
  if (useProduction) {
    printProductionEnvTarget(loadProductionEnv());
    console.log("");
  } else {
    loadEnv({ path: ".env.local" });
    loadEnv();
  }

  const { getPrisma } = await import("../src/lib/db.server");
  const { getDatabaseFingerprint, getDatabaseUrlHash } = await import(
    "../src/lib/dbFingerprint"
  );

  const fp = getDatabaseFingerprint();
  const urlHash = getDatabaseUrlHash();
  console.log("ACTIVE_CONNECTION:", { ...fp, urlHash });

  const prisma = getPrisma();

  const migrationRows = await prisma.$queryRaw<
    { migration_name: string; finished_at: Date | null }[]
  >`
    SELECT migration_name, finished_at
    FROM "_prisma_migrations"
    WHERE migration_name = ${FINGERPRINT_MIGRATION}
  `;

  const detectionRows = await prisma.$queryRaw<
    {
      regclass_text: string | null;
      info_schema_exists: boolean;
    }[]
  >`
    SELECT
      to_regclass('public."SupplierFingerprint"')::text AS regclass_text,
      EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = ${FINGERPRINT_TABLE}
      ) AS info_schema_exists
  `;

  const similarTables = await prisma.$queryRaw<
    { schemaname: string; tablename: string }[]
  >`
    SELECT schemaname, tablename
    FROM pg_tables
    WHERE tablename ILIKE '%fingerprint%'
    ORDER BY schemaname, tablename
  `;

  const detection = detectionRows[0];
  const regclassName = normalizeRegclassName(detection?.regclass_text);
  const tableExists =
    detection?.info_schema_exists === true ||
    regclassName === FINGERPRINT_TABLE;

  console.log("MIGRATION_APPLIED:", migrationRows.length > 0);
  if (migrationRows[0]) {
    console.log("MIGRATION:", migrationRows[0]);
  } else {
    console.log("MIGRATION:", null);
  }
  console.log("TO_REGCLASS:", detection?.regclass_text ?? null);
  console.log("TO_REGCLASS_NORMALIZED:", regclassName);
  console.log("INFO_SCHEMA_EXISTS:", detection?.info_schema_exists ?? false);
  console.log("SIMILAR_TABLES:", similarTables);
  console.log("TABLE_EXISTS:", tableExists);

  if (tableExists) {
    let rowCount: number | null = null;
    try {
      rowCount = await prisma.supplierFingerprint.count();
    } catch (err) {
      console.warn(
        "[fingerprint:check] prisma count failed, falling back to raw SQL:",
        err instanceof Error ? err.message : String(err)
      );
      const raw = await prisma.$queryRaw<{ count: number }[]>`
        SELECT COUNT(*)::int AS count FROM "SupplierFingerprint"
      `;
      rowCount = raw[0]?.count ?? null;
    }

    const supplierCount = await prisma.supplier.count();
    console.log("ROW_COUNT:", rowCount);
    console.log("SUPPLIER_COUNT:", supplierCount);
    console.log("ROWS_MATCH_SUPPLIERS:", rowCount === supplierCount);
  } else {
    console.log("ROW_COUNT:", null);
  }

  if (useProduction && process.argv.includes("--require-table") && !tableExists) {
    throw new Error("SupplierFingerprint table is missing on production.");
  }
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  })
  .finally(async () => {
    try {
      const { getPrisma } = await import("../src/lib/db.server");
      await getPrisma().$disconnect();
    } catch {
      /* ignore */
    }
  });
