/**
 * Load ABC Supply capability rows from crawler JSON into SupplierCapability.
 *
 * Requires: DATABASE_URL in the environment (e.g. `export $(grep DATABASE_URL .env.local | xargs)` or
 * `node -r dotenv/config node_modules/.bin/tsx scripts/load-abc-capabilities.ts dotenv_config_path=.env.local`)
 *
 * Input: ./scripts/output/abc-supply-capabilities.json
 *
 * Run from repo root: npx tsx scripts/load-abc-capabilities.ts
 */

import fs from "fs";
import { getPrisma } from "@/lib/db.server";

async function main() {
  const prisma = getPrisma();

  const data = JSON.parse(
    fs.readFileSync("./scripts/output/abc-supply-capabilities.json", "utf-8")
  );

  for (const record of data) {
    await prisma.supplierCapability.create({
      data: {
        supplierId: record.supplierId || "abc_supply_hsv",
        subcategory: record.subcategory,
        brand: record.brand,
        sourceUrl: record.sourceUrl,
        confidence: record.confidence,
      },
    });
  }

  console.log("Inserted capabilities");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await getPrisma().$disconnect();
  });
