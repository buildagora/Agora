/**
 * Backfill Supplier Category Links
 * 
 * One-time script to create SupplierCategoryLink records for existing
 * supplier organizations that don't have category links yet.
 * 
 * For each Supplier:
 * - If no SupplierCategoryLink exists:
 *   - Derive categories from SupplierMember users' categoriesServed
 *   - Or fallback to Supplier.category (legacy field)
 *   - Create SupplierCategoryLink entries for those categories
 * 
 * All operations run in transactions per supplier.
 * 
 * Run with: npm run backfill:supplier-categories
 */

import { getPrisma } from "../src/lib/db.server";
import { labelToCategoryId, categoryIdToLabel } from "../src/lib/categoryIds";

const prisma = getPrisma();

async function main() {
  console.log("Starting supplier category links backfill...");

  // Get all suppliers with their category links and members
  const suppliers = await prisma.supplier.findMany({
    include: {
      categoryLinks: true,
      members: {
        where: { status: "ACTIVE" },
        include: {
          user: {
            select: {
              id: true,
              categoriesServed: true,
            },
          },
        },
      },
    },
    orderBy: { name: "asc" },
  });

  console.log(`Found ${suppliers.length} supplier organizations`);

  let processed = 0;
  let skipped = 0;
  let linksCreated = 0;
  let errors = 0;

  for (const supplier of suppliers) {
    try {
      // Skip if already has category links
      if (supplier.categoryLinks.length > 0) {
        console.log(`Skipping ${supplier.name}: already has ${supplier.categoryLinks.length} category link(s)`);
        skipped++;
        continue;
      }

      // Collect category IDs from active members' categoriesServed
      const categoryIds = new Set<string>();

      for (const member of supplier.members) {
        if (member.user.categoriesServed) {
          try {
            const categories = JSON.parse(member.user.categoriesServed) as string[];
            for (const cat of categories) {
              if (typeof cat === "string" && cat.trim()) {
                const trimmed = cat.trim();
                // Try to normalize: check if it's a label or categoryId
                const categoryId = labelToCategoryId[trimmed as keyof typeof labelToCategoryId] || trimmed.toLowerCase();
                // Validate it's a known categoryId
                if (categoryId in categoryIdToLabel) {
                  categoryIds.add(categoryId);
                }
              }
            }
          } catch {
            // Invalid JSON, skip
          }
        }
      }

      // Fallback: if no categories from members, try Supplier.category (legacy field)
      if (categoryIds.size === 0 && supplier.category) {
        const categoryLabel = supplier.category.toUpperCase();
        const categoryId = labelToCategoryId[categoryLabel as keyof typeof labelToCategoryId];
        if (categoryId && categoryId in categoryIdToLabel) {
          categoryIds.add(categoryId);
        } else {
          // Try direct match (case-insensitive)
          const lowerCategory = supplier.category.toLowerCase();
          for (const [label, id] of Object.entries(labelToCategoryId)) {
            if (label.toLowerCase() === lowerCategory || id.toLowerCase() === lowerCategory) {
              categoryIds.add(id);
              break;
            }
          }
        }
      }

      // If still no categories, skip this supplier
      if (categoryIds.size === 0) {
        console.log(`Skipping ${supplier.name}: no categories found in members or legacy field`);
        skipped++;
        continue;
      }

      // Create category links
      const linksToCreate = Array.from(categoryIds).map((categoryId) => ({
        supplierId: supplier.id,
        categoryId,
      }));

      await prisma.supplierCategoryLink.createMany({
        data: linksToCreate,
        skipDuplicates: true,
      });

      linksCreated += linksToCreate.length;
      const categoryLabels = Array.from(categoryIds)
        .map((id) => categoryIdToLabel[id as keyof typeof categoryIdToLabel] || id)
        .join(", ");
      console.log(`Created ${linksToCreate.length} category link(s) for ${supplier.name}: ${categoryLabels}`);
      processed++;
    } catch (error) {
      console.error(`Error processing supplier ${supplier.id} (${supplier.name}):`, error);
      errors++;
    }
  }

  console.log("\nBackfill complete:");
  console.log(`  Processed: ${processed}`);
  console.log(`  Skipped: ${skipped}`);
  console.log(`  Category links created: ${linksCreated}`);
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



