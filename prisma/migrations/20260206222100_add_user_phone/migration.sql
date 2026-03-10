/*
  Warnings:

  - A unique constraint covering the columns `[buyerId,categoryId]` on the table `PreferredSupplierRule` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "PreferredSupplierRule" ADD COLUMN     "categoryId" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "phone" TEXT;

-- CreateTable
CREATE TABLE "EmailEvent" (
    "id" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "providerMessageId" TEXT,
    "error" TEXT,
    "rfqId" TEXT,
    "supplierId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmailEvent_rfqId_idx" ON "EmailEvent"("rfqId");

-- CreateIndex
CREATE INDEX "EmailEvent_supplierId_idx" ON "EmailEvent"("supplierId");

-- CreateIndex
CREATE INDEX "EmailEvent_status_idx" ON "EmailEvent"("status");

-- CreateIndex
CREATE INDEX "EmailEvent_createdAt_idx" ON "EmailEvent"("createdAt");

-- CreateIndex
CREATE INDEX "PreferredSupplierRule_buyerId_categoryId_idx" ON "PreferredSupplierRule"("buyerId", "categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "PreferredSupplierRule_buyerId_categoryId_key" ON "PreferredSupplierRule"("buyerId", "categoryId");
