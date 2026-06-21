import assert from "node:assert/strict";
import { Prisma } from "@prisma/client";
import { getPrisma } from "@/lib/db.server";
import { loadSupplierFingerprintFacts } from "../loadSupplierFingerprintFacts.server";

console.log("\nloadSupplierFingerprintFacts defensive tests\n");

async function withMockFindUnique(
  impl: (...args: unknown[]) => Promise<unknown>,
  run: () => Promise<void>
) {
  const prisma = getPrisma();
  const previous = prisma.supplierFingerprint.findUnique.bind(
    prisma.supplierFingerprint
  );
  (prisma.supplierFingerprint as { findUnique: typeof impl }).findUnique = impl;
  try {
    await run();
  } finally {
    prisma.supplierFingerprint.findUnique = previous;
  }
}

async function main() {
  await withMockFindUnique(
    async () => {
      throw new Prisma.PrismaClientKnownRequestError(
        "The table `public.SupplierFingerprint` does not exist in the current database.",
        { code: "P2021", clientVersion: "test" }
      );
    },
    async () => {
      const facts = await loadSupplierFingerprintFacts("wilson_lumber_hsv");
      assert.equal(facts, null, "P2021 returns null");
    }
  );

  await withMockFindUnique(
    async () => null,
    async () => {
      const facts = await loadSupplierFingerprintFacts("missing_supplier");
      assert.equal(facts, null, "missing row returns null");
    }
  );

  console.log("All loadSupplierFingerprintFacts defensive tests passed.\n");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await getPrisma().$disconnect();
  });
