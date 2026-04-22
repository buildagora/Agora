-- Ops workflow tracking on material requests
ALTER TABLE "MaterialRequest" ADD COLUMN "opsStatus" TEXT NOT NULL DEFAULT 'NEW';
ALTER TABLE "MaterialRequest" ADD COLUMN "opsUpdatedAt" TIMESTAMP(3);
