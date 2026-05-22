-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "public"."ClaimStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "public"."ContactSource" AS ENUM ('SEEDED', 'USER_SUBMITTED', 'VERIFIED');

-- CreateEnum
CREATE TYPE "public"."SupplierContactType" AS ENUM ('PRIMARY_INBOX', 'SALES_REP', 'ESTIMATOR', 'OTHER');

-- CreateEnum
CREATE TYPE "public"."SupplierInviteStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "public"."SupplierMemberRole" AS ENUM ('ADMIN', 'MEMBER');

-- CreateEnum
CREATE TYPE "public"."SupplierMemberStatus" AS ENUM ('PENDING', 'ACTIVE', 'REJECTED');

-- CreateEnum
CREATE TYPE "public"."SupplierVerificationMethod" AS ENUM ('INVITE', 'EMAIL_DOMAIN', 'MANUAL');

-- CreateTable
CREATE TABLE "public"."AgentThread" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "anonymousId" TEXT,
    "title" TEXT,
    "messages" TEXT NOT NULL DEFAULT '[]',
    "draft" TEXT NOT NULL DEFAULT '{}',
    "meta" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AnalyticsEvent" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "visitorId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "source" TEXT,
    "medium" TEXT,
    "campaign" TEXT,
    "path" TEXT,
    "properties" TEXT,
    "country" TEXT,
    "region" TEXT,
    "city" TEXT,
    "userId" TEXT,
    "role" TEXT,
    "isInternal" BOOLEAN DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnalyticsEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Bid" (
    "id" TEXT NOT NULL,
    "rfqId" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'SUBMITTED',
    "lineItems" TEXT NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "deliveryCharge" DOUBLE PRECISION,
    "total" DOUBLE PRECISION,
    "leadTimeDays" INTEGER,
    "seenByBuyerAt" TIMESTAMP(3),
    "seenBySellerAt" TIMESTAMP(3),

    CONSTRAINT "Bid_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."EmailEvent" (
    "id" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "providerMessageId" TEXT,
    "error" TEXT,
    "rfqId" TEXT,
    "supplierId" TEXT,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" TIMESTAMP(3),
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."EmailVerificationToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailVerificationToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."MaterialRequest" (
    "id" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "buyerName" TEXT,
    "buyerPhone" TEXT,
    "categoryId" TEXT NOT NULL,
    "requestText" TEXT NOT NULL,
    "sendMode" TEXT NOT NULL,
    "supplierIdsJson" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "closedAt" TIMESTAMP(3),
    "fulfilledAt" TIMESTAMP(3),
    "locationCity" TEXT,
    "locationRegion" TEXT,
    "locationCountry" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "opsStatus" TEXT NOT NULL DEFAULT 'NEW',
    "opsUpdatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MaterialRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."MaterialRequestRecipient" (
    "id" TEXT NOT NULL,
    "materialRequestId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SENT',
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "viewedAt" TIMESTAMP(3),
    "respondedAt" TIMESTAMP(3),
    "statusUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "operatorNotes" TEXT,
    "availabilityStatus" TEXT,
    "quantityAvailable" INTEGER,
    "quantityUnit" TEXT,
    "price" DECIMAL(10,2),
    "priceUnit" TEXT,
    "pickupAvailable" BOOLEAN,
    "deliveryAvailable" BOOLEAN,
    "deliveryEta" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MaterialRequestRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Message" (
    "id" TEXT NOT NULL,
    "rfqId" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "buyerId" TEXT,
    "sellerId" TEXT,
    "fromRole" TEXT NOT NULL,
    "fromName" TEXT,
    "senderId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" TEXT,
    "seenByBuyerAt" TIMESTAMP(3),
    "seenBySellerAt" TIMESTAMP(3),

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "rfqId" TEXT,
    "type" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),
    "data" TEXT,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Order" (
    "id" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "rfqId" TEXT NOT NULL,
    "bidId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lineItems" TEXT NOT NULL,
    "subtotal" DOUBLE PRECISION NOT NULL,
    "taxes" DOUBLE PRECISION NOT NULL,
    "total" DOUBLE PRECISION NOT NULL,
    "fulfillmentType" TEXT NOT NULL,
    "requestedDate" TEXT NOT NULL,
    "deliveryPreference" TEXT,
    "deliveryInstructions" TEXT,
    "location" TEXT,
    "notes" TEXT,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PreferredSupplierRule" (
    "id" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "categoryId" TEXT,
    "sellerIds" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PreferredSupplierRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."RFQ" (
    "id" TEXT NOT NULL,
    "rfqNumber" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "title" TEXT NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "category" TEXT NOT NULL,
    "categoryId" TEXT,
    "buyerId" TEXT NOT NULL,
    "jobNameOrPo" TEXT,
    "visibility" TEXT,
    "targetSupplierIds" TEXT,
    "lineItems" TEXT NOT NULL,
    "terms" TEXT NOT NULL,
    "awardedBidId" TEXT,
    "awardedAt" TIMESTAMP(3),

    CONSTRAINT "RFQ_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Supplier" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "domain" TEXT,
    "category" TEXT NOT NULL,
    "street" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "zip" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "phone" TEXT,
    "email" TEXT,
    "logoUrl" TEXT,
    "hoursText" TEXT,
    "onboarded" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SupplierCapability" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "subcategory" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "productLine" TEXT,
    "sourceUrl" TEXT NOT NULL,
    "confidence" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplierCapability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SupplierCategoryLink" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplierCategoryLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SupplierClaimRequest" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "requestedEmail" TEXT,
    "method" "public"."SupplierVerificationMethod" NOT NULL,
    "status" "public"."ClaimStatus" NOT NULL DEFAULT 'PENDING',
    "reviewNote" TEXT,
    "reviewedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),

    CONSTRAINT "SupplierClaimRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SupplierContact" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "type" "public"."SupplierContactType" NOT NULL,
    "source" "public"."ContactSource" NOT NULL DEFAULT 'SEEDED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplierContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SupplierConversation" (
    "id" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "rfqId" TEXT,
    "materialRequestId" TEXT,
    "title" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "hiddenForBuyerAt" TIMESTAMP(3),
    "hiddenForSupplierAt" TIMESTAMP(3),

    CONSTRAINT "SupplierConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SupplierInvite" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "invitedByUserId" TEXT NOT NULL,
    "status" "public"."SupplierInviteStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "acceptedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplierInvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SupplierMember" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "public"."SupplierMemberRole" NOT NULL DEFAULT 'MEMBER',
    "status" "public"."SupplierMemberStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verifiedAt" TIMESTAMP(3),

    CONSTRAINT "SupplierMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SupplierMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "senderType" TEXT NOT NULL,
    "senderDisplayName" TEXT,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedForBuyerAt" TIMESTAMP(3),
    "deletedForSupplierAt" TIMESTAMP(3),

    CONSTRAINT "SupplierMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "fullName" TEXT,
    "companyName" TEXT,
    "phone" TEXT,
    "role" TEXT NOT NULL,
    "categoriesServed" TEXT,
    "serviceArea" TEXT,
    "agreedToTermsAt" TIMESTAMP(3),
    "agreedToTermsVersion" TEXT,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "emailVerifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AgentThread_anonymousId_idx" ON "public"."AgentThread"("anonymousId" ASC);

-- CreateIndex
CREATE INDEX "AgentThread_userId_idx" ON "public"."AgentThread"("userId" ASC);

-- CreateIndex
CREATE INDEX "AnalyticsEvent_city_createdAt_idx" ON "public"."AnalyticsEvent"("city" ASC, "createdAt" ASC);

-- CreateIndex
CREATE INDEX "AnalyticsEvent_city_idx" ON "public"."AnalyticsEvent"("city" ASC);

-- CreateIndex
CREATE INDEX "AnalyticsEvent_country_idx" ON "public"."AnalyticsEvent"("country" ASC);

-- CreateIndex
CREATE INDEX "AnalyticsEvent_createdAt_idx" ON "public"."AnalyticsEvent"("createdAt" ASC);

-- CreateIndex
CREATE INDEX "AnalyticsEvent_name_createdAt_idx" ON "public"."AnalyticsEvent"("name" ASC, "createdAt" ASC);

-- CreateIndex
CREATE INDEX "AnalyticsEvent_name_idx" ON "public"."AnalyticsEvent"("name" ASC);

-- CreateIndex
CREATE INDEX "AnalyticsEvent_region_idx" ON "public"."AnalyticsEvent"("region" ASC);

-- CreateIndex
CREATE INDEX "AnalyticsEvent_sessionId_idx" ON "public"."AnalyticsEvent"("sessionId" ASC);

-- CreateIndex
CREATE INDEX "AnalyticsEvent_visitorId_idx" ON "public"."AnalyticsEvent"("visitorId" ASC);

-- CreateIndex
CREATE INDEX "EmailEvent_createdAt_idx" ON "public"."EmailEvent"("createdAt" ASC);

-- CreateIndex
CREATE INDEX "EmailEvent_rfqId_idx" ON "public"."EmailEvent"("rfqId" ASC);

-- CreateIndex
CREATE INDEX "EmailEvent_status_idx" ON "public"."EmailEvent"("status" ASC);

-- CreateIndex
CREATE INDEX "EmailEvent_supplierId_idx" ON "public"."EmailEvent"("supplierId" ASC);

-- CreateIndex
CREATE INDEX "EmailVerificationToken_expiresAt_idx" ON "public"."EmailVerificationToken"("expiresAt" ASC);

-- CreateIndex
CREATE INDEX "EmailVerificationToken_tokenHash_idx" ON "public"."EmailVerificationToken"("tokenHash" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "EmailVerificationToken_tokenHash_key" ON "public"."EmailVerificationToken"("tokenHash" ASC);

-- CreateIndex
CREATE INDEX "EmailVerificationToken_userId_idx" ON "public"."EmailVerificationToken"("userId" ASC);

-- CreateIndex
CREATE INDEX "MaterialRequest_buyerId_idx" ON "public"."MaterialRequest"("buyerId" ASC);

-- CreateIndex
CREATE INDEX "MaterialRequest_categoryId_idx" ON "public"."MaterialRequest"("categoryId" ASC);

-- CreateIndex
CREATE INDEX "MaterialRequest_createdAt_idx" ON "public"."MaterialRequest"("createdAt" ASC);

-- CreateIndex
CREATE INDEX "MaterialRequest_status_idx" ON "public"."MaterialRequest"("status" ASC);

-- CreateIndex
CREATE INDEX "MaterialRequestRecipient_conversationId_idx" ON "public"."MaterialRequestRecipient"("conversationId" ASC);

-- CreateIndex
CREATE INDEX "MaterialRequestRecipient_materialRequestId_idx" ON "public"."MaterialRequestRecipient"("materialRequestId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "MaterialRequestRecipient_materialRequestId_supplierId_key" ON "public"."MaterialRequestRecipient"("materialRequestId" ASC, "supplierId" ASC);

-- CreateIndex
CREATE INDEX "MaterialRequestRecipient_status_idx" ON "public"."MaterialRequestRecipient"("status" ASC);

-- CreateIndex
CREATE INDEX "MaterialRequestRecipient_supplierId_idx" ON "public"."MaterialRequestRecipient"("supplierId" ASC);

-- CreateIndex
CREATE INDEX "PreferredSupplierRule_buyerId_categoryId_idx" ON "public"."PreferredSupplierRule"("buyerId" ASC, "categoryId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "PreferredSupplierRule_buyerId_categoryId_key" ON "public"."PreferredSupplierRule"("buyerId" ASC, "categoryId" ASC);

-- CreateIndex
CREATE INDEX "Supplier_category_idx" ON "public"."Supplier"("category" ASC);

-- CreateIndex
CREATE INDEX "Supplier_city_state_idx" ON "public"."Supplier"("city" ASC, "state" ASC);

-- CreateIndex
CREATE INDEX "SupplierCapability_brand_idx" ON "public"."SupplierCapability"("brand" ASC);

-- CreateIndex
CREATE INDEX "SupplierCapability_categoryId_idx" ON "public"."SupplierCapability"("categoryId" ASC);

-- CreateIndex
CREATE INDEX "SupplierCapability_subcategory_idx" ON "public"."SupplierCapability"("subcategory" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "SupplierCapability_supplierId_categoryId_subcategory_brand__key" ON "public"."SupplierCapability"("supplierId" ASC, "categoryId" ASC, "subcategory" ASC, "brand" ASC, "productLine" ASC);

-- CreateIndex
CREATE INDEX "SupplierCapability_supplierId_idx" ON "public"."SupplierCapability"("supplierId" ASC);

-- CreateIndex
CREATE INDEX "SupplierCategoryLink_categoryId_idx" ON "public"."SupplierCategoryLink"("categoryId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "SupplierCategoryLink_supplierId_categoryId_key" ON "public"."SupplierCategoryLink"("supplierId" ASC, "categoryId" ASC);

-- CreateIndex
CREATE INDEX "SupplierCategoryLink_supplierId_idx" ON "public"."SupplierCategoryLink"("supplierId" ASC);

-- CreateIndex
CREATE INDEX "SupplierClaimRequest_status_idx" ON "public"."SupplierClaimRequest"("status" ASC);

-- CreateIndex
CREATE INDEX "SupplierClaimRequest_supplierId_idx" ON "public"."SupplierClaimRequest"("supplierId" ASC);

-- CreateIndex
CREATE INDEX "SupplierContact_supplierId_idx" ON "public"."SupplierContact"("supplierId" ASC);

-- CreateIndex
CREATE INDEX "SupplierConversation_buyerId_hiddenForBuyerAt_updatedAt_idx" ON "public"."SupplierConversation"("buyerId" ASC, "hiddenForBuyerAt" ASC, "updatedAt" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "SupplierConversation_buyerId_supplierId_rfqId_materialReque_key" ON "public"."SupplierConversation"("buyerId" ASC, "supplierId" ASC, "rfqId" ASC, "materialRequestId" ASC);

-- CreateIndex
CREATE INDEX "SupplierConversation_buyerId_updatedAt_idx" ON "public"."SupplierConversation"("buyerId" ASC, "updatedAt" ASC);

-- CreateIndex
CREATE INDEX "SupplierConversation_materialRequestId_idx" ON "public"."SupplierConversation"("materialRequestId" ASC);

-- CreateIndex
CREATE INDEX "SupplierConversation_rfqId_idx" ON "public"."SupplierConversation"("rfqId" ASC);

-- CreateIndex
CREATE INDEX "SupplierConversation_supplierId_hiddenForSupplierAt_updated_idx" ON "public"."SupplierConversation"("supplierId" ASC, "hiddenForSupplierAt" ASC, "updatedAt" ASC);

-- CreateIndex
CREATE INDEX "SupplierConversation_supplierId_updatedAt_idx" ON "public"."SupplierConversation"("supplierId" ASC, "updatedAt" ASC);

-- CreateIndex
CREATE INDEX "SupplierInvite_email_idx" ON "public"."SupplierInvite"("email" ASC);

-- CreateIndex
CREATE INDEX "SupplierInvite_status_idx" ON "public"."SupplierInvite"("status" ASC);

-- CreateIndex
CREATE INDEX "SupplierInvite_supplierId_idx" ON "public"."SupplierInvite"("supplierId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "SupplierInvite_tokenHash_key" ON "public"."SupplierInvite"("tokenHash" ASC);

-- CreateIndex
CREATE INDEX "SupplierMember_supplierId_idx" ON "public"."SupplierMember"("supplierId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "SupplierMember_supplierId_userId_key" ON "public"."SupplierMember"("supplierId" ASC, "userId" ASC);

-- CreateIndex
CREATE INDEX "SupplierMember_userId_idx" ON "public"."SupplierMember"("userId" ASC);

-- CreateIndex
CREATE INDEX "SupplierMessage_conversationId_createdAt_idx" ON "public"."SupplierMessage"("conversationId" ASC, "createdAt" ASC);

-- CreateIndex
CREATE INDEX "SupplierMessage_conversationId_deletedForBuyerAt_createdAt_idx" ON "public"."SupplierMessage"("conversationId" ASC, "deletedForBuyerAt" ASC, "createdAt" ASC);

-- CreateIndex
CREATE INDEX "SupplierMessage_conversationId_deletedForSupplierAt_created_idx" ON "public"."SupplierMessage"("conversationId" ASC, "deletedForSupplierAt" ASC, "createdAt" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "public"."User"("email" ASC);

-- AddForeignKey
ALTER TABLE "public"."AgentThread" ADD CONSTRAINT "AgentThread_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Bid" ADD CONSTRAINT "Bid_rfqId_fkey" FOREIGN KEY ("rfqId") REFERENCES "public"."RFQ"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Bid" ADD CONSTRAINT "Bid_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."EmailVerificationToken" ADD CONSTRAINT "EmailVerificationToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MaterialRequest" ADD CONSTRAINT "MaterialRequest_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MaterialRequestRecipient" ADD CONSTRAINT "MaterialRequestRecipient_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "public"."SupplierConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MaterialRequestRecipient" ADD CONSTRAINT "MaterialRequestRecipient_materialRequestId_fkey" FOREIGN KEY ("materialRequestId") REFERENCES "public"."MaterialRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MaterialRequestRecipient" ADD CONSTRAINT "MaterialRequestRecipient_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "public"."Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Message" ADD CONSTRAINT "Message_rfqId_fkey" FOREIGN KEY ("rfqId") REFERENCES "public"."RFQ"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Notification" ADD CONSTRAINT "Notification_rfqId_fkey" FOREIGN KEY ("rfqId") REFERENCES "public"."RFQ"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Order" ADD CONSTRAINT "Order_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PreferredSupplierRule" ADD CONSTRAINT "PreferredSupplierRule_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RFQ" ADD CONSTRAINT "RFQ_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SupplierCategoryLink" ADD CONSTRAINT "SupplierCategoryLink_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "public"."Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SupplierClaimRequest" ADD CONSTRAINT "SupplierClaimRequest_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SupplierClaimRequest" ADD CONSTRAINT "SupplierClaimRequest_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "public"."Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SupplierClaimRequest" ADD CONSTRAINT "SupplierClaimRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SupplierContact" ADD CONSTRAINT "SupplierContact_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "public"."Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SupplierConversation" ADD CONSTRAINT "SupplierConversation_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SupplierConversation" ADD CONSTRAINT "SupplierConversation_materialRequestId_fkey" FOREIGN KEY ("materialRequestId") REFERENCES "public"."MaterialRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SupplierConversation" ADD CONSTRAINT "SupplierConversation_rfqId_fkey" FOREIGN KEY ("rfqId") REFERENCES "public"."RFQ"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SupplierConversation" ADD CONSTRAINT "SupplierConversation_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "public"."Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SupplierInvite" ADD CONSTRAINT "SupplierInvite_acceptedByUserId_fkey" FOREIGN KEY ("acceptedByUserId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SupplierInvite" ADD CONSTRAINT "SupplierInvite_invitedByUserId_fkey" FOREIGN KEY ("invitedByUserId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SupplierInvite" ADD CONSTRAINT "SupplierInvite_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "public"."Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SupplierMember" ADD CONSTRAINT "SupplierMember_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "public"."Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SupplierMember" ADD CONSTRAINT "SupplierMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SupplierMessage" ADD CONSTRAINT "SupplierMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "public"."SupplierConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

