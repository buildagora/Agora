import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.supplier.createMany({
    data: [
      {
        category: "ROOFING",
        name: "ABC Supply Co",
        street: "917 Meridian St N",
        city: "Huntsville",
        state: "AL",
        zip: "35801",
        phone: "256-536-9307",
        email: "malik.gordon@abcsupply.com",
      },
      {
        category: "ROOFING",
        name: "QXO",
        street: "579 Plummer Rd NW Ste 200",
        city: "Huntsville",
        state: "AL",
        zip: "35806",
        phone: "256-361-0912",
        email: "brs847orders@qxo.com",
      },
      {
        category: "ROOFING",
        name: "SRS Building Products",
        street: "6215 Old Madison Pike NW",
        city: "Huntsville",
        state: "AL",
        zip: "35806",
        phone: "256-852-6415",
        email: "ordershuntsville@srsbuildingproducts.com",
      },
      {
        category: "ROOFING",
        name: "Gulfeagle Supply",
        street: "300 Blake Bottom Rd NW",
        city: "Huntsville",
        state: "AL",
        zip: "35806",
        phone: "256-851-8990",
        email: "kmcneese@gulfeaglesupply.com",
      },
    ],
    skipDuplicates: true,
  });

  const rows = await prisma.supplier.findMany({
    where: { category: "ROOFING" },
    orderBy: { name: "asc" },
    select: { name: true, street: true, city: true, state: true, zip: true, phone: true, email: true },
  });

  console.log("[seed_suppliers_roofing_v3] ROOFING suppliers in DB:");
  for (const r of rows) {
    console.log(`- ${r.name} | ${r.street}, ${r.city}, ${r.state} ${r.zip} | ${r.phone ?? ""} | ${r.email ?? ""}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });



