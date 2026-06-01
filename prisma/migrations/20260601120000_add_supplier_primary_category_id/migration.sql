-- Add canonical primary category column (backfilled by scripts/backfill-supplier-primary-category.ts)
ALTER TABLE "Supplier" ADD COLUMN "primaryCategoryId" TEXT;

CREATE INDEX "Supplier_primaryCategoryId_idx" ON "Supplier"("primaryCategoryId");
