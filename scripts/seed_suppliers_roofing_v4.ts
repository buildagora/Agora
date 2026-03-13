import { getPrisma } from "../src/lib/db.server";

type SupplierSeed = {
  category: "ROOFING";
  name: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  phone?: string;
  email?: string;
};

const SUPPLIERS: SupplierSeed[] = [
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
  {
    category: "ROOFING",
    name: "Agora Supply",
    street: "100 Builder Way",
    city: "Huntsville",
    state: "AL",
    zip: "35801",
    phone: "256-555-0101",
    email: "buildagora@gmail.com",
  },
];

async function main() {
  const prisma = getPrisma();

  let created = 0;
  let existing = 0;

  for (const s of SUPPLIERS) {
    const found = await prisma.supplier.findFirst({
      where: {
        name: s.name,
        street: s.street,
        city: s.city,
        state: s.state,
        zip: s.zip,
        category: s.category,
      },
      select: { id: true },
    });

    if (found) {
      existing++;
      continue;
    }

    await prisma.supplier.create({ data: s });
    created++;
  }

  const rows = await prisma.supplier.findMany({
    where: { category: "ROOFING" },
    orderBy: { name: "asc" },
    select: { name: true, street: true, city: true, state: true, zip: true, phone: true, email: true },
  });

  console.log(`[seed_suppliers_roofing_v4] created=${created} existing=${existing} total_roofing=${rows.length}`);
  for (const r of rows) {
    console.log(`- ${r.name} | ${r.street}, ${r.city}, ${r.state} ${r.zip} | ${r.phone ?? ""} | ${r.email ?? ""}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

