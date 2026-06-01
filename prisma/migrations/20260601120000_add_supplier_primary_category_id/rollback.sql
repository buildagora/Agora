-- Rollback: 20260601120000_add_supplier_primary_category_id
-- Run only if you need to undo the schema change. Does NOT restore prior category values.

DROP INDEX IF EXISTS "Supplier_primaryCategoryId_idx";

ALTER TABLE "Supplier" DROP COLUMN IF EXISTS "primaryCategoryId";
