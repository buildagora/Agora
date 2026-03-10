-- AlterTable: Add rfqId to SupplierConversation
-- This allows RFQ-scoped conversations: one conversation per RFQ per buyer-supplier pair
-- Existing conversations without rfqId remain as "general" conversations

-- Step 1: Add rfqId column (nullable for backward compatibility)
ALTER TABLE "SupplierConversation" ADD COLUMN IF NOT EXISTS "rfqId" TEXT;

-- Step 2: Drop old unique constraint
DROP INDEX IF EXISTS "SupplierConversation_buyerId_supplierId_key";

-- Step 3: Add new unique constraint that includes rfqId
-- This allows: one conversation per (buyerId, supplierId, rfqId) combination
-- NULL rfqId values are considered distinct, so one "general" conversation per buyer-supplier pair is still allowed
CREATE UNIQUE INDEX IF NOT EXISTS "SupplierConversation_buyerId_supplierId_rfqId_key" 
  ON "SupplierConversation"("buyerId", "supplierId", "rfqId");

-- Step 4: Add index on rfqId for efficient lookups
CREATE INDEX IF NOT EXISTS "SupplierConversation_rfqId_idx" ON "SupplierConversation"("rfqId");

-- Step 5: Add foreign key constraint to RFQ
ALTER TABLE "SupplierConversation" 
  ADD CONSTRAINT "SupplierConversation_rfqId_fkey" 
  FOREIGN KEY ("rfqId") REFERENCES "RFQ"("id") 
  ON DELETE SET NULL ON UPDATE CASCADE;

