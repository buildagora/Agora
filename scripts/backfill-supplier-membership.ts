/**
 * Backfill Supplier Membership
 * 
 * One-time script to migrate existing seller-supplier relationships
 * from email-based matching to SupplierMember records.
 * 
 * For each User with role SELLER:
 * - If there is a Supplier with email matching user.email, create:
 *   - SupplierMember (ACTIVE status)
 *   - SupplierClaimRequest (APPROVED, method=EMAIL_DOMAIN)
 * - Otherwise leave unlinked (no membership)
 * 
 * Run with: npx tsx scripts/backfill-supplier-membership.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Starting supplier membership backfill...");

  // Get all SELLER users
  const sellers = await prisma.user.findMany({
    where: { role: "SELLER" },
    select: {
      id: true,
      email: true,
    },
  });

  console.log(`Found ${sellers.length} seller users`);

  let created = 0;
  let skipped = 0;
  let errors = 0;

  for (const seller of sellers) {
    try {
      if (!seller.email) {
        console.log(`Skipping seller ${seller.id}: no email`);
        skipped++;
        continue;
      }

      // Find supplier with matching email
      const supplier = await prisma.supplier.findFirst({
        where: { email: seller.email },
        select: { id: true },
      });

      if (!supplier) {
        console.log(`Skipping seller ${seller.id}: no matching supplier for ${seller.email}`);
        skipped++;
        continue;
      }

      // Check if membership already exists
      const existingMember = await prisma.supplierMember.findUnique({
        where: {
          supplierId_userId: {
            supplierId: supplier.id,
            userId: seller.id,
          },
        },
      });

      if (existingMember) {
        console.log(`Skipping seller ${seller.id}: membership already exists for supplier ${supplier.id}`);
        skipped++;
        continue;
      }

      // Create SupplierMember (ACTIVE)
      const member = await prisma.supplierMember.create({
        data: {
          supplierId: supplier.id,
          userId: seller.id,
          role: "MEMBER",
          status: "ACTIVE",
          verifiedAt: new Date(),
        },
      });

      // Create SupplierClaimRequest (APPROVED, method=EMAIL_DOMAIN)
      await prisma.supplierClaimRequest.create({
        data: {
          supplierId: supplier.id,
          userId: seller.id,
          requestedEmail: seller.email,
          method: "EMAIL_DOMAIN",
          status: "APPROVED",
          reviewedAt: new Date(),
        },
      });

      console.log(`Created membership for seller ${seller.id} -> supplier ${supplier.id}`);
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



