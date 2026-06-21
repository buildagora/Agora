import { getPrisma } from "../src/lib/db.server";
import { getDatabaseFingerprint, getDatabaseUrlHash } from "../src/lib/dbFingerprint";

async function main() {
  const fp = getDatabaseFingerprint();
  const urlHash = getDatabaseUrlHash();
  console.log("DATABASE:", { ...fp, urlHash });

  const prisma = getPrisma();

  const migrationRows = await prisma.$queryRaw<
    { migration_name: string; finished_at: Date | null }[]
  >`
    SELECT migration_name, finished_at
    FROM "_prisma_migrations"
    WHERE migration_name = '20260604120000_add_supplier_fingerprint'
  `;
  console.log("MIGRATION:", migrationRows);

  const tableRows = await prisma.$queryRaw<{ table_exists: string | null }[]>`
    SELECT to_regclass('public."SupplierFingerprint"')::text AS table_exists
  `;
  console.log("TABLE:", tableRows[0]?.table_exists ?? null);

  try {
    const count = await prisma.supplierFingerprint.count();
    console.log("ROW_COUNT:", count);
  } catch (err) {
    console.log(
      "ROW_COUNT_ERROR:",
      err instanceof Error ? err.message : String(err)
    );
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    const { getPrisma } = await import("../src/lib/db.server");
    await getPrisma().$disconnect();
  });
