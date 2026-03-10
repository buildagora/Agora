/**
 * Backfill Seller Organizations
 * 
 * One-time script to create Supplier and SupplierMember records
 * for existing SELLER users who don't have organization membership.
 * 
 * For each User with role SELLER:
 * - If no SupplierMember exists for that user:
 *   - Create Supplier (using companyName/fullName/email for name)
 *   - Create SupplierMember (ADMIN, ACTIVE, verifiedAt = now)
 * 
 * All operations run in transactions per seller.
 * 
 * Run with: npm run backfill:seller-orgs
 */

import { getPrisma } from "../src/lib/db.server";

const prisma = getPrisma();

async function main() {
  console.log("Starting seller organization backfill...");

  // Get all SELLER users
  const sellers = await prisma.user.findMany({
    where: { role: "SELLER" },
    select: {
      id: true,
      email: true,
      fullName: true,
      companyName: true,
      categoriesServed: true,
    },
  });

  console.log(`Found ${sellers.length} seller users`);

  let created = 0;
  let skipped = 0;
  let errors = 0;

  for (const seller of sellers) {
    try {
      // Check if SupplierMember already exists
      const existingMember = await prisma.supplierMember.findFirst({
        where: { userId: seller.id },
        select: { id: true },
      });

      if (existingMember) {
        console.log(`Skipping seller ${seller.id}: membership already exists`);
        skipped++;
        continue;
      }

      // Create Supplier and SupplierMember in a transaction
      await prisma.$transaction(async (tx) => {
        // Determine supplier name
        const supplierName = seller.companyName?.trim() || seller.fullName?.trim() || seller.email || "Unnamed Supplier";

        // Determine category from categoriesServed (first category, or "OTHER")
        let supplierCategory = "OTHER";
        if (seller.categoriesServed) {
          try {
            const categories = JSON.parse(seller.categoriesServed) as string[];
            if (categories && categories.length > 0) {
              supplierCategory = categories[0].toUpperCase();
            }
          } catch {
            // Invalid JSON, use default
          }
        }

        // Create Supplier
        const supplier = await tx.supplier.create({
          data: {
            name: supplierName,
            category: supplierCategory,
            street: "", // Placeholder - can be updated later
            city: "", // Placeholder - can be updated later
            state: "", // Placeholder - can be updated later
            zip: "", // Placeholder - can be updated later
            email: seller.email || null,
            phone: null,
            onboarded: false,
          },
        });

        // Create SupplierMember
        await tx.supplierMember.create({
          data: {
            supplierId: supplier.id,
            userId: seller.id,
            role: "ADMIN",
            status: "ACTIVE",
            verifiedAt: new Date(),
          },
        });

        console.log(`Created org for seller ${seller.id} (${seller.email}) -> supplier ${supplier.id} (${supplierName})`);
      });

      created++;
    } catch (error) {
      console.error(`Error processing seller ${seller.id}:`, error);
      errors++;
    }
  }

  console.log("\nBackfill complete:");
  console.log(`  Created: ${created}`);
  console.log(`  Skipped: ${skipped}`);
  console.log(`  Errors: ${errors}`);
}

main()
  .catch((e) => {
    console.error("Fatal error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
