/*
  Warnings:

  - You are about to drop the column `state` on the `AgentThread` table. All the data in the column will be lost.
  - You are about to drop the column `deliveryAddress` on the `RFQ` table. All the data in the column will be lost.
  - You are about to drop the column `fulfillmentType` on the `RFQ` table. All the data in the column will be lost.
  - You are about to drop the column `needBy` on the `RFQ` table. All the data in the column will be lost.
  - You are about to drop the column `phone` on the `User` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "SupplierMemberRole" AS ENUM ('ADMIN', 'MEMBER');

-- CreateEnum
CREATE TYPE "SupplierMemberStatus" AS ENUM ('PENDING', 'ACTIVE', 'REJECTED');

-- CreateEnum
CREATE TYPE "SupplierVerificationMethod" AS ENUM ('INVITE', 'EMAIL_DOMAIN', 'MANUAL');

-- CreateEnum
CREATE TYPE "ClaimStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "SupplierContactType" AS ENUM ('PRIMARY_INBOX', 'SALES_REP', 'ESTIMATOR', 'OTHER');

-- CreateEnum
CREATE TYPE "ContactSource" AS ENUM ('SEEDED', 'USER_SUBMITTED', 'VERIFIED');

-- AlterTable
ALTER TABLE "AgentThread" DROP COLUMN "state";

-- AlterTable
ALTER TABLE "RFQ" DROP COLUMN "deliveryAddress",
DROP COLUMN "fulfillmentType",
DROP COLUMN "needBy";

-- AlterTable
ALTER TABLE "SupplierInvite" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "User" DROP COLUMN "phone";

-- CreateTable
CREATE TABLE "SupplierMember" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "SupplierMemberRole" NOT NULL DEFAULT 'MEMBER',
    "status" "SupplierMemberStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verifiedAt" TIMESTAMP(3),

    CONSTRAINT "SupplierMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierClaimRequest" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "requestedEmail" TEXT,
    "method" "SupplierVerificationMethod" NOT NULL,
    "status" "ClaimStatus" NOT NULL DEFAULT 'PENDING',
    "reviewNote" TEXT,
    "reviewedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),

    CONSTRAINT "SupplierClaimRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierContact" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "type" "SupplierContactType" NOT NULL,
    "source" "ContactSource" NOT NULL DEFAULT 'SEEDED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplierContact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SupplierMember_userId_idx" ON "SupplierMember"("userId");

-- CreateIndex
CREATE INDEX "SupplierMember_supplierId_idx" ON "SupplierMember"("supplierId");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierMember_supplierId_userId_key" ON "SupplierMember"("supplierId", "userId");

-- CreateIndex
CREATE INDEX "SupplierClaimRequest_status_idx" ON "SupplierClaimRequest"("status");

-- CreateIndex
CREATE INDEX "SupplierClaimRequest_supplierId_idx" ON "SupplierClaimRequest"("supplierId");

-- CreateIndex
CREATE INDEX "SupplierContact_supplierId_idx" ON "SupplierContact"("supplierId");

-- AddForeignKey
ALTER TABLE "SupplierMember" ADD CONSTRAINT "SupplierMember_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierMember" ADD CONSTRAINT "SupplierMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierClaimRequest" ADD CONSTRAINT "SupplierClaimRequest_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierClaimRequest" ADD CONSTRAINT "SupplierClaimRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierClaimRequest" ADD CONSTRAINT "SupplierClaimRequest_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierContact" ADD CONSTRAINT "SupplierContact_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;
