/**
 * Backfill MaterialRequestRecipient rows for big-box suppliers on existing requests.
 * Dev/staging only — run after requests exist without full big-box coverage.
 *
 * Usage:
 *   npx tsx scripts/seed/backfill-big-box-recipients.ts
 *   npx tsx scripts/seed/backfill-big-box-recipients.ts --dry-run
 */
import "dotenv/config";
import { getPrisma } from "@/lib/db.server";

export const BIG_BOX_SUPPLIER_IDS = [
  "home_depot_hsv",
  "home_depot_madison",
  "home_depot_north_hsv",
  "home_depot_south_hsv",
  "home_depot_west_hsv",
  "lowes_hsv",
  "lowes_madison",
  "lowes_madison_hsv",
  "lowes_north_hsv",
  "lowes_south_hsv",
] as const;

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const prisma = getPrisma();

  const requests = await prisma.materialRequest.findMany({
    select: {
      id: true,
      buyerId: true,
      requestText: true,
      recipients: { select: { supplierId: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  let created = 0;
  let skipped = 0;

  for (const req of requests) {
    const existing = new Set(req.recipients.map((r) => r.supplierId));
    const missing = BIG_BOX_SUPPLIER_IDS.filter((id) => !existing.has(id));
    if (missing.length === 0) continue;

    const title = req.requestText.trim().slice(0, 80) || "Material request";

    for (const supplierId of missing) {
      const supplier = await prisma.supplier.findUnique({
        where: { id: supplierId },
        select: { id: true },
      });
      if (!supplier) {
        console.warn(`  skip ${supplierId} — not in Supplier table`);
        skipped += 1;
        continue;
      }

      if (dryRun) {
        console.log(`[dry-run] would link ${supplierId} → request ${req.id}`);
        created += 1;
        continue;
      }

      await prisma.$transaction(async (tx) => {
        const conversation = await tx.supplierConversation.create({
          data: {
            buyerId: req.buyerId,
            supplierId,
            rfqId: null,
            materialRequestId: req.id,
            title,
          },
        });

        await tx.materialRequestRecipient.create({
          data: {
            materialRequestId: req.id,
            supplierId,
            conversationId: conversation.id,
            status: "SENT",
            sentAt: new Date(),
            statusUpdatedAt: new Date(),
          },
        });
      });

      console.log(`linked ${supplierId} → ${req.id}`);
      created += 1;
    }
  }

  console.log(
    `\nDone. ${dryRun ? "Would create" : "Created"} ${created} recipient row(s), skipped ${skipped}.`
  );
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
