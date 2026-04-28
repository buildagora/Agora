-- Capture the anonymous buyer's name + phone on each MaterialRequest so the
-- supplier-reply path can SMS the buyer back. Buyer phone is never returned
-- to suppliers (no schema change to SupplierMessage / SupplierConversation,
-- which already strip the buyer User join).
--
-- Hand-written rather than via `prisma migrate dev`: the existing migration
-- history fails shadow-DB validation (see project memory). This was applied
-- to dev with `prisma db push`; on `main` apply via raw SQL or `db push`
-- until the broken history is rebaselined.

ALTER TABLE "MaterialRequest" ADD COLUMN "buyerName" TEXT;
ALTER TABLE "MaterialRequest" ADD COLUMN "buyerPhone" TEXT;
