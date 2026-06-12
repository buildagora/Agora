-- CreateEnum
CREATE TYPE "SupplierPlatform" AS ENUM ('SHOPIFY', 'MAGENTO', 'HYBRIS', 'BIGCOMMERCE', 'WOOCOMMERCE', 'CONSTRUCTOR', 'BLOOMREACH', 'SLI', 'COVEO', 'ALGOLIA', 'CUSTOM_COMMERCE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "PlatformAccessStatus" AS ENUM ('NOT_APPLICABLE', 'UNKNOWN', 'ACCESSIBLE', 'PUBLIC_ANONYMOUS', 'REQUIRES_AUTH', 'REQUIRES_CONTRACT', 'BINDING_INCOMPLETE', 'PROBE_FAILED', 'BLOCKED');

-- CreateEnum
CREATE TYPE "PublicApiAccessStatus" AS ENUM ('NOT_PROBED', 'NOT_FOUND', 'ACCESSIBLE', 'REQUIRES_AUTH', 'BLOCKED');

-- CreateEnum
CREATE TYPE "RenderingType" AS ENUM ('SERVER_RENDERED', 'SPA', 'HYBRID', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "AntiBotRisk" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'HARD_BLOCK', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "DemandPriority" AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'DEPRIORITIZED');

-- CreateEnum
CREATE TYPE "ExtractionStrategy" AS ENUM ('PLATFORM_API', 'PUBLIC_API', 'SCHEMA_OR_SITEMAP', 'HTML_SCRAPE', 'PLAYWRIGHT', 'ANTI_BOT_EVALUATION', 'SERP_PRODUCT_ENGINE', 'SERP_SITE_ORGANIC', 'PROBABILISTIC_CATEGORY_PROFILE', 'NONE');

-- CreateEnum
CREATE TYPE "FingerprintStatus" AS ENUM ('PENDING', 'SUCCESS', 'PARTIAL', 'FAILED', 'STALE');

-- CreateTable
CREATE TABLE "SupplierFingerprint" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "canonicalDomain" TEXT,
    "detectedPlatform" "SupplierPlatform" NOT NULL DEFAULT 'UNKNOWN',
    "platformDetectionConfidence" DOUBLE PRECISION,
    "platformDetectionSource" TEXT,
    "platformBindingId" TEXT,
    "platformBindingValid" BOOLEAN NOT NULL DEFAULT false,
    "platformAccessStatus" "PlatformAccessStatus" NOT NULL DEFAULT 'UNKNOWN',
    "hasPublicApi" BOOLEAN,
    "publicApiAccessStatus" "PublicApiAccessStatus" NOT NULL DEFAULT 'NOT_PROBED',
    "publicApiEndpoint" TEXT,
    "hasSchemaMarkup" BOOLEAN,
    "hasSitemap" BOOLEAN,
    "sitemapUrls" JSONB,
    "renderingType" "RenderingType" NOT NULL DEFAULT 'UNKNOWN',
    "isSPA" BOOLEAN,
    "antiBotRisk" "AntiBotRisk" NOT NULL DEFAULT 'UNKNOWN',
    "demandPriority" "DemandPriority" NOT NULL DEFAULT 'MEDIUM',
    "demandScore" INTEGER,
    "allowSerpFallback" BOOLEAN NOT NULL DEFAULT false,
    "fingerprintStatus" "FingerprintStatus" NOT NULL DEFAULT 'PENDING',
    "lastFingerprintedAt" TIMESTAMP(3),
    "legacySnapshot" JSONB,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplierFingerprint_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SupplierFingerprint_supplierId_key" ON "SupplierFingerprint"("supplierId");

-- CreateIndex
CREATE INDEX "SupplierFingerprint_canonicalDomain_idx" ON "SupplierFingerprint"("canonicalDomain");

-- CreateIndex
CREATE INDEX "SupplierFingerprint_detectedPlatform_idx" ON "SupplierFingerprint"("detectedPlatform");

-- CreateIndex
CREATE INDEX "SupplierFingerprint_platformAccessStatus_idx" ON "SupplierFingerprint"("platformAccessStatus");

-- CreateIndex
CREATE INDEX "SupplierFingerprint_demandPriority_idx" ON "SupplierFingerprint"("demandPriority");

-- CreateIndex
CREATE INDEX "SupplierFingerprint_fingerprintStatus_idx" ON "SupplierFingerprint"("fingerprintStatus");

-- CreateIndex
CREATE INDEX "SupplierFingerprint_allowSerpFallback_idx" ON "SupplierFingerprint"("allowSerpFallback");

-- AddForeignKey
ALTER TABLE "SupplierFingerprint" ADD CONSTRAINT "SupplierFingerprint_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;
