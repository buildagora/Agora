-- AlterTable
ALTER TABLE "MaterialRequestRecipient" ADD COLUMN "availabilityStatus" TEXT,
ADD COLUMN "quantityAvailable" INTEGER,
ADD COLUMN "quantityUnit" TEXT,
ADD COLUMN "price" DECIMAL(10,2),
ADD COLUMN "priceUnit" TEXT,
ADD COLUMN "pickupAvailable" BOOLEAN,
ADD COLUMN "deliveryAvailable" BOOLEAN,
ADD COLUMN "deliveryEta" TEXT;
