-- CreateEnum
CREATE TYPE "SupplierInviteStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED');

-- CreateTable
CREATE TABLE "SupplierInvite" (
  "id" TEXT NOT NULL,
  "supplierId" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "invitedByUserId" TEXT NOT NULL,
  "status" "SupplierInviteStatus" NOT NULL DEFAULT 'PENDING',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "acceptedAt" TIMESTAMP(3),
  "acceptedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SupplierInvite_pkey" PRIMARY KEY ("id")
);

-- Uniques
CREATE UNIQUE INDEX "SupplierInvite_tokenHash_key" ON "SupplierInvite"("tokenHash");

-- Indexes
CREATE INDEX "SupplierInvite_supplierId_idx" ON "SupplierInvite"("supplierId");
CREATE INDEX "SupplierInvite_email_idx" ON "SupplierInvite"("email");
CREATE INDEX "SupplierInvite_status_idx" ON "SupplierInvite"("status");

-- Foreign keys
ALTER TABLE "SupplierInvite"
  ADD CONSTRAINT "SupplierInvite_supplierId_fkey"
  FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SupplierInvite"
  ADD CONSTRAINT "SupplierInvite_invitedByUserId_fkey"
  FOREIGN KEY ("invitedByUserId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SupplierInvite"
  ADD CONSTRAINT "SupplierInvite_acceptedByUserId_fkey"
  FOREIGN KEY ("acceptedByUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
