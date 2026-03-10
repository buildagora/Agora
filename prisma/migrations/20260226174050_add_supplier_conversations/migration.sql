-- Ensure Supplier table exists (shadow DB safety)
CREATE TABLE IF NOT EXISTS "Supplier" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "street" TEXT NOT NULL,
  "city" TEXT NOT NULL,
  "state" TEXT NOT NULL,
  "zip" TEXT NOT NULL,
  "phone" TEXT,
  "email" TEXT,
  "onboarded" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Supplier_category_idx" ON "Supplier"("category");
CREATE INDEX IF NOT EXISTS "Supplier_city_state_idx" ON "Supplier"("city", "state");

-- CreateTable
CREATE TABLE "SupplierCategoryLink" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplierCategoryLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierConversation" (
    "id" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "title" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplierConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "senderType" TEXT NOT NULL,
    "senderDisplayName" TEXT,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplierMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SupplierCategoryLink_supplierId_categoryId_key" ON "SupplierCategoryLink"("supplierId", "categoryId");

-- CreateIndex
CREATE INDEX "SupplierCategoryLink_supplierId_idx" ON "SupplierCategoryLink"("supplierId");

-- CreateIndex
CREATE INDEX "SupplierCategoryLink_categoryId_idx" ON "SupplierCategoryLink"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierConversation_buyerId_supplierId_key" ON "SupplierConversation"("buyerId", "supplierId");

-- CreateIndex
CREATE INDEX "SupplierConversation_buyerId_updatedAt_idx" ON "SupplierConversation"("buyerId", "updatedAt");

-- CreateIndex
CREATE INDEX "SupplierConversation_supplierId_updatedAt_idx" ON "SupplierConversation"("supplierId", "updatedAt");

-- CreateIndex
CREATE INDEX "SupplierMessage_conversationId_createdAt_idx" ON "SupplierMessage"("conversationId", "createdAt");

-- AddForeignKey
ALTER TABLE "SupplierCategoryLink" ADD CONSTRAINT "SupplierCategoryLink_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierConversation" ADD CONSTRAINT "SupplierConversation_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierConversation" ADD CONSTRAINT "SupplierConversation_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierMessage" ADD CONSTRAINT "SupplierMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "SupplierConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

