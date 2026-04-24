/**
 * Smoke-test supplier capability search (SupplierCapability).
 *
 * Run from repo root: npx tsx scripts/test-capability-search.ts
 * Requires DATABASE_URL (e.g. via .env.local + dotenv or exported env).
 */

import { getPrisma } from "@/lib/db.server";
import { searchCapabilities } from "@/lib/search/capabilitySearch";

const query = "GAF shingles";

function meaningfulTerms(text: string): string[] {
  return text
    .trim()
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
}

async function main() {
  const prisma = getPrisma();

  const terms = meaningfulTerms(query);
  if (terms.length === 0) {
    console.log("No meaningful query terms after splitting.");
    return;
  }

  const matches = await prisma.supplierCapability.findMany({
    where: {
      OR: terms.flatMap((term) => [
        { brand: { contains: term, mode: "insensitive" } },
        { subcategory: { contains: term, mode: "insensitive" } },
      ]),
    },
    orderBy: { createdAt: "desc" },
  });

  console.log(`Query: "${query}"`);
  console.log(`Terms: ${terms.join(", ")}`);
  console.log(`Matches: ${matches.length}\n`);

  for (const r of matches) {
    console.log({
      supplierId: r.supplierId,
      subcategory: r.subcategory,
      brand: r.brand,
      sourceUrl: r.sourceUrl,
    });
  }

  const top = await searchCapabilities(query);

  console.log("\nTop Results:");

  for (const result of top) {
    console.log(result);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await getPrisma().$disconnect();
  });
