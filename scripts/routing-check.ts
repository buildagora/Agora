import { getPrisma } from "../src/lib/db.server";

(async () => {
  const prisma = getPrisma();

  const rfqs = await prisma.rFQ.findMany({
    where: { status: "OPEN" },
    select: { id: true, rfqNumber: true, visibility: true, targetSupplierIds: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const direct = rfqs.filter((r) => (r.visibility ?? "broadcast") === "direct");
  const directWithTargets = direct.filter((r) => r.targetSupplierIds && String(r.targetSupplierIds).trim().length > 0);

  console.log(
    JSON.stringify(
      {
        totalOpen: rfqs.length,
        directCount: direct.length,
        directWithTargetsCount: directWithTargets.length,
        sampleDirectWithTargets: directWithTargets.slice(0, 5),
      },
      null,
      2
    )
  );

  await prisma.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
