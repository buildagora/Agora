import { getPrisma } from "../src/lib/db.server";
import { categoryIdToLabel } from "../src/lib/categoryIds";

type SupplierSeed = {
  name: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  phone?: string;
  email?: string;
  categoryIds: string[]; // Array of category IDs (e.g., ["roofing", "hvac"])
  onboarded?: boolean;
};

const SUPPLIERS: SupplierSeed[] = [
  {
    name: "QXO Supply",
    street: "579 Plummer Rd NW Ste 200",
    city: "Huntsville",
    state: "AL",
    zip: "35806",
    phone: "256-361-0912",
    email: "brs847orders@qxo.com",
    categoryIds: ["roofing", "electrical"],
    onboarded: true,
  },
  {
    name: "ABC Supply Co",
    street: "917 Meridian St N",
    city: "Huntsville",
    state: "AL",
    zip: "35801",
    phone: "256-536-9307",
    email: "malik.gordon@abcsupply.com",
    categoryIds: ["roofing", "lumber_siding"],
    onboarded: true,
  },
  {
    name: "SRS Building Products",
    street: "6215 Old Madison Pike NW",
    city: "Huntsville",
    state: "AL",
    zip: "35806",
    phone: "256-852-6415",
    email: "ordershuntsville@srsbuildingproducts.com",
    categoryIds: ["roofing"],
    onboarded: true,
  },
  {
    name: "Gulfeagle Supply",
    street: "300 Blake Bottom Rd NW",
    city: "Huntsville",
    state: "AL",
    zip: "35806",
    phone: "256-851-8990",
    email: "kmcneese@gulfeaglesupply.com",
    categoryIds: ["roofing", "hvac"],
    onboarded: true,
  },
  {
    name: "HVAC Pro Supply",
    street: "123 Main St",
    city: "Huntsville",
    state: "AL",
    zip: "35801",
    phone: "256-555-0100",
    email: "orders@hvacpro.com",
    categoryIds: ["hvac", "electrical"],
    onboarded: true,
  },
  {
    name: "Plumbing Plus",
    street: "456 Oak Ave",
    city: "Huntsville",
    state: "AL",
    zip: "35802",
    phone: "256-555-0200",
    email: "contact@plumbingplus.com",
    categoryIds: ["plumbing"],
    onboarded: true,
  },
  {
    name: "Framing Experts",
    street: "789 Pine St",
    city: "Huntsville",
    state: "AL",
    zip: "35803",
    phone: "256-555-0300",
    email: "info@framingexperts.com",
    categoryIds: ["framing", "lumber_siding"],
    onboarded: true,
  },
  {
    name: "Concrete Solutions",
    street: "321 Elm Blvd",
    city: "Huntsville",
    state: "AL",
    zip: "35804",
    phone: "256-555-0400",
    email: "sales@concretesolutions.com",
    categoryIds: ["concrete"],
    onboarded: true,
  },
  {
    name: "Drywall Masters",
    street: "654 Maple Dr",
    city: "Huntsville",
    state: "AL",
    zip: "35805",
    phone: "256-555-0500",
    email: "orders@drywallmasters.com",
    categoryIds: ["drywall"],
    onboarded: true,
  },
];

async function main() {
  const prisma = getPrisma();

  let created = 0;
  let updated = 0;
  let categoryLinksCreated = 0;

  for (const s of SUPPLIERS) {
    // Find existing supplier by name and address
    let supplier = await prisma.supplier.findFirst({
      where: {
        name: s.name,
        street: s.street,
        city: s.city,
        state: s.state,
        zip: s.zip,
      },
      include: {
        categoryLinks: true,
      },
    });

    if (supplier) {
      // Update existing supplier
      supplier = await prisma.supplier.update({
        where: { id: supplier.id },
        data: {
          phone: s.phone || supplier.phone,
          email: s.email || supplier.email,
          onboarded: s.onboarded ?? supplier.onboarded,
          category: s.categoryIds[0] ? categoryIdToLabel[s.categoryIds[0] as keyof typeof categoryIdToLabel] || "ROOFING" : supplier.category,
        },
        include: {
          categoryLinks: true,
        },
      });
      updated++;
    } else {
      // Create new supplier
      supplier = await prisma.supplier.create({
        data: {
          name: s.name,
          street: s.street,
          city: s.city,
          state: s.state,
          zip: s.zip,
          phone: s.phone,
          email: s.email,
          category: s.categoryIds[0] ? categoryIdToLabel[s.categoryIds[0] as keyof typeof categoryIdToLabel] || "ROOFING" : "ROOFING",
          onboarded: s.onboarded ?? false,
        },
        include: {
          categoryLinks: true,
        },
      });
      created++;
    }

    // Ensure category links exist
    const existingCategoryIds = new Set(supplier.categoryLinks.map((cl) => cl.categoryId));
    for (const categoryId of s.categoryIds) {
      if (!existingCategoryIds.has(categoryId)) {
        await prisma.supplierCategoryLink.create({
          data: {
            supplierId: supplier.id,
            categoryId: categoryId,
          },
        });
        categoryLinksCreated++;
      }
    }
  }

  // Summary
  const allSuppliers = await prisma.supplier.findMany({
    where: { onboarded: true },
    include: {
      categoryLinks: true,
    },
    orderBy: { name: "asc" },
  });

  console.log(`[seed_suppliers_categories] created=${created} updated=${updated} categoryLinksCreated=${categoryLinksCreated} total_onboarded=${allSuppliers.length}`);
  
  for (const s of allSuppliers) {
    const categories = s.categoryLinks.map((cl) => categoryIdToLabel[cl.categoryId as keyof typeof categoryIdToLabel] || cl.categoryId).join(", ");
    console.log(`- ${s.name} | Categories: ${categories || "none"}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

