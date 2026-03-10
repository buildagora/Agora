/**
 * Buyer RFQ List API
 * Returns all RFQs for the authenticated buyer
 */

import { NextRequest, NextResponse } from "next/server";
import { requireServerEnv } from "@/lib/env";
import { jsonOk, jsonError, withErrorHandling, type ApiSuccess } from "@/lib/apiResponse";
import { requireCurrentUserFromRequest } from "@/lib/auth/server";
import { getPrisma } from "@/lib/db.server";
import { sendSupplierOnboardingEmail } from "@/lib/notifications/resend.server";

// CRITICAL: Explicitly set nodejs runtime - Prisma cannot run in Edge runtime
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return withErrorHandling(async () => {
    requireServerEnv();

    let user;
    try {
      user = await requireCurrentUserFromRequest(request);
    } catch {
      return jsonError("UNAUTHORIZED", "Authentication required", 401);
    }

    if (user.role !== "BUYER") {
      return jsonError("FORBIDDEN", "Buyer access required", 403);
    }

    // Query RFQs from database (server-side, single source of truth)
    const prisma = getPrisma();
    const dbRfqs = await prisma.rFQ.findMany({
      where: { buyerId: user.id },
      orderBy: { createdAt: "desc" },
    });

    // Return array with id + rfqNumber + summary fields
    // Gracefully handle empty state (return empty array, not error)
    // Parse JSON fields (lineItems, terms) from database
    const summaryRfqs = dbRfqs.map(rfq => {
      // Parse lineItems from JSON string
      let lineItems: any[] = [];
      try {
        lineItems = rfq.lineItems ? JSON.parse(rfq.lineItems) : [];
      } catch {
        lineItems = [];
      }

      // Parse terms from JSON string
      let terms: any = {};
      try {
        terms = rfq.terms ? JSON.parse(rfq.terms) : {};
      } catch {
        terms = {};
      }

      // Parse targetSupplierIds from JSON string
      let targetSupplierIds: string[] = [];
      try {
        targetSupplierIds = rfq.targetSupplierIds ? JSON.parse(rfq.targetSupplierIds) : [];
      } catch {
        targetSupplierIds = [];
      }

      return {
        id: rfq.id,
        rfqNumber: rfq.rfqNumber,
        status: rfq.status,
        createdAt: rfq.createdAt.toISOString(),
        title: rfq.title,
        notes: rfq.notes || "",
        category: rfq.category,
        jobNameOrPo: rfq.jobNameOrPo || null,
        buyerId: rfq.buyerId,
        visibility: rfq.visibility as "broadcast" | "direct" | undefined,
        targetSupplierIds,
        lineItems,
        terms,
        awardedBidId: rfq.awardedBidId || null,
        awardedAt: rfq.awardedAt?.toISOString() || null,
      };
    });

    // NEW FOUNDATION: Return direct array (empty array if no RFQs, never 500)
    // Client handles both direct array and { ok: true, data: [...] } formats
    // Cast through unknown to satisfy withErrorHandling type constraint
    return NextResponse.json(summaryRfqs, {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }) as unknown as NextResponse<ApiSuccess<typeof summaryRfqs>>;
  });
}

/**
 * Buyer RFQ Create API
 * Creates a new RFQ for the authenticated buyer
 */

import { z } from "zod";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rateLimit";
import { categoryIdToLabel, type CategoryId } from "@/lib/categoryIds";

// Derive valid CategoryId values from canonical source
const VALID_CATEGORY_IDS = Object.keys(categoryIdToLabel) as CategoryId[];

const RFQPayloadSchema = z.object({
  id: z.string().optional(),
  rfqNumber: z.string().optional(),
  status: z.enum(["DRAFT", "OPEN", "PUBLISHED", "AWARDED", "CLOSED"]).optional(),
  createdAt: z.string().optional(),
  title: z.string().min(1),
  notes: z.string().optional().default("").transform((v) => v?.trim() ?? ""),
  category: z.string().min(1).optional(), // Display label (optional, for backward compatibility)
  categoryId: z.string().refine((val): val is CategoryId => VALID_CATEGORY_IDS.includes(val as CategoryId), {
    message: "categoryId must be a valid CategoryId",
  }), // CRITICAL: Canonical categoryId is required
  buyerId: z.string().optional(),
  visibility: z.enum(["broadcast", "direct"]).optional(),
  targetSupplierIds: z.array(z.string()).optional(),
  lineItems: z.array(z.object({
    description: z.string().min(1),
    unit: z.string().min(1),
    quantity: z.number().positive(),
  })).min(1),
  terms: z.object({
    fulfillmentType: z.enum(["PICKUP", "DELIVERY"]),
    requestedDate: z.string().min(1),
    deliveryPreference: z.enum(["MORNING", "ANYTIME"]).optional(),
    deliveryInstructions: z.string().optional(),
    location: z.string().optional(),
  }),
});

export async function POST(request: NextRequest) {
  return withErrorHandling(async () => {
    // CRITICAL: Log API hit (always, not just dev)
    console.log("[RFQ_CREATE_API_HIT]");

    requireServerEnv();

    let user;
    try {
      user = await requireCurrentUserFromRequest(request);
    } catch {
      return jsonError("UNAUTHORIZED", "Authentication required", 401);
    }

    if (user.role !== "BUYER") {
      return jsonError("FORBIDDEN", "Buyer access required", 403);
    }

    // Rate limiting by userId
    if (!checkRateLimit(`rfq:${user.id}`, RATE_LIMITS.RFQ_CREATE.maxTokens, RATE_LIMITS.RFQ_CREATE.refillRate)) {
      return jsonError("RATE_LIMIT", "Too many RFQ creation requests. Please slow down.", 429);
    }

    // Request size limit (32KB)
    const rawText = await request.text();
    if (rawText.length > 32 * 1024) {
      return jsonError("PAYLOAD_TOO_LARGE", "Request body too large (max 32KB)", 413);
    }

    // Parse and validate body
    let body;
    try {
      body = JSON.parse(rawText);
    } catch {
      return jsonError("BAD_REQUEST", "Invalid JSON", 400);
    }

    const { payload } = body;
    if (!payload) {
      return jsonError("BAD_REQUEST", "payload required", 400);
    }

    // DEV-ONLY: Log incoming payload before validation
    if (process.env.NODE_ENV === "development") {
      console.log("📥 RFQ_CREATE_INCOMING", {
        category: payload.category,
        hasCategory: !!payload.category,
        categoryType: typeof payload.category,
        title: payload.title,
        lineItemsCount: payload.lineItems?.length || 0,
        fulfillmentType: payload.terms?.fulfillmentType,
      });
    }

    const validation = RFQPayloadSchema.safeParse(payload);
    if (!validation.success) {
      // DEV-ONLY: Log validation errors
      if (process.env.NODE_ENV === "development") {
        console.error("❌ RFQ_CREATE_VALIDATION_FAILED", {
          errors: validation.error.issues,
          payloadCategory: payload.category,
        });
      }
      return jsonError("BAD_REQUEST", "Invalid RFQ payload", 400, validation.error.issues);
    }

    const validatedPayload = validation.data;
    
    // DEV-ONLY: Log validated payload
    if (process.env.NODE_ENV === "development") {
      console.log("✅ RFQ_CREATE_VALIDATED", {
        category: validatedPayload.category,
        rfqNumber: validatedPayload.rfqNumber || "will be generated",
        title: validatedPayload.title,
      });
    }

    // Get Prisma client
    const prisma = getPrisma();

    // Generate RFQ number if not provided
    const existingRFQs = await prisma.rFQ.findMany({
      where: { buyerId: user.id },
      orderBy: { createdAt: "desc" },
      take: 100, // Get recent RFQs for number generation
    });

    let rfqNumber = validatedPayload.rfqNumber;
    if (!rfqNumber) {
      const currentYear = new Date().getFullYear();
      const yearPrefix = currentYear.toString().slice(-2);
      let maxNumber = 0;
      for (const rfq of existingRFQs) {
        if (rfq.rfqNumber.startsWith(`RFQ-${yearPrefix}-`)) {
          const numberPart = rfq.rfqNumber.split("-")[2];
          const num = parseInt(numberPart, 10);
          if (!isNaN(num) && num > maxNumber) {
            maxNumber = num;
          }
        }
        if (rfq.rfqNumber.startsWith(`RQ-${currentYear}-`)) {
          const numberPart = rfq.rfqNumber.split("-")[2];
          const num = parseInt(numberPart, 10);
          if (!isNaN(num) && num > maxNumber) {
            maxNumber = num;
          }
        }
      }
      rfqNumber = `RFQ-${yearPrefix}-${(maxNumber + 1).toString().padStart(4, "0")}`;
    }

    // CRITICAL: categoryId is required and validated by schema
    // Derive category label from categoryId if not provided (for backward compatibility)
    const categoryLabel = validatedPayload.category || categoryIdToLabel[validatedPayload.categoryId] || validatedPayload.categoryId;

    // GUARDRAIL: Direct RFQs must have targetSupplierIds
    if (validatedPayload.visibility === "direct" && (!validatedPayload.targetSupplierIds || validatedPayload.targetSupplierIds.length === 0)) {
      return jsonError("BAD_REQUEST", "Direct RFQs must specify at least one targetSupplierId", 400);
    }

    // NORMALIZE targetSupplierIds: Convert seller user IDs to supplier org IDs
    // CRITICAL: targetSupplierIds must contain SUPPLIER ORGANIZATION IDs, not seller user IDs
    let normalizedTargetSupplierIds: string[] = [];
    if (validatedPayload.targetSupplierIds && validatedPayload.targetSupplierIds.length > 0) {
      // Check if incoming IDs are seller user IDs or supplier org IDs
      // Strategy: Try to find SupplierMember records for each ID
      // If found, use the supplierId (org ID); if not found, assume it's already an org ID
      const incomingIds = validatedPayload.targetSupplierIds;
      
      // Query SupplierMember to see which IDs are user IDs
      const memberships = await prisma.supplierMember.findMany({
        where: {
          userId: { in: incomingIds },
          status: "ACTIVE",
        },
        select: {
          userId: true,
          supplierId: true,
        },
      });

      // Build map: userId -> supplierId
      const userIdToOrgId = new Map(memberships.map(m => [m.userId, m.supplierId]));

      // Normalize: convert user IDs to org IDs, keep org IDs as-is
      const orgIdSet = new Set<string>();
      for (const id of incomingIds) {
        if (userIdToOrgId.has(id)) {
          // This is a user ID, convert to org ID
          orgIdSet.add(userIdToOrgId.get(id)!);
        } else {
          // Assume it's already an org ID (or invalid, but we'll let it through)
          orgIdSet.add(id);
        }
      }

      normalizedTargetSupplierIds = Array.from(orgIdSet);

      // Log normalization for debugging
      if (memberships.length > 0) {
        console.log("[RFQ_TARGET_SUPPLIER_NORMALIZATION]", {
          incomingCount: incomingIds.length,
          normalizedCount: normalizedTargetSupplierIds.length,
          convertedUserIds: memberships.length,
        });
      }
    }

    // Determine RFQ status: default to OPEN for all RFQs (direct RFQs are also OPEN by default)
    const defaultStatus = "OPEN";
    const rfqStatus = validatedPayload.status || defaultStatus;

    // Create RFQ in database (Prisma-backed, single source of truth)
    // Use relation connect instead of buyerId to satisfy required relation
    const created = await prisma.rFQ.create({
      data: {
        id: validatedPayload.id || crypto.randomUUID(),
        rfqNumber,
        status: rfqStatus, // Use determined status (defaults to OPEN for all RFQs)
        title: validatedPayload.title,
        notes: validatedPayload.notes?.trim() ?? "",
        category: categoryLabel, // Display label (derived from categoryId if not provided)
        categoryId: validatedPayload.categoryId, // CRITICAL: Canonical categoryId (required)
        buyer: { connect: { id: user.id } }, // ✅ REQUIRED RELATION - Server enforces ownership
        lineItems: JSON.stringify(validatedPayload.lineItems),
        terms: JSON.stringify(validatedPayload.terms),
        visibility: validatedPayload.visibility || "broadcast",
        targetSupplierIds: normalizedTargetSupplierIds.length > 0
          ? JSON.stringify(normalizedTargetSupplierIds)
          : null,
        createdAt: validatedPayload.createdAt 
          ? new Date(validatedPayload.createdAt) 
          : new Date(),
      },
    });
    
    // CRITICAL: Log DB creation success immediately after create
    console.log("[RFQ_CREATE_DB_OK]", {
      id: created.id,
    });
    
    // CRITICAL: Log RFQ creation (always, not just dev)
    console.log("[RFQ_CREATE_OK]", {
      rfqId: created.id,
      createdByUserId: user.id,
      categoryId: created.categoryId || created.category,
      visibility: created.visibility || "broadcast",
      rfqNumber: created.rfqNumber,
      status: created.status,
    });
    
    // Build response body (without supplierCount - will be added back later safely)
    const responseBody = {
      id: created.id, // CRITICAL: DB primary key (canonical id)
      rfqId: created.id, // Alias for backward compatibility
      rfqNumber: created.rfqNumber,
      status: created.status,
    };

    // Run supplier resolution + notifications in background (fire-and-forget)
    if (rfqStatus === "OPEN") {
      queueMicrotask(async () => {
        try {
          // STEP 1: Resolve matching suppliers by category + location
          // Determine routing:
          // - If payload.targetSupplierIds exists and is non-empty → use those supplier IDs
          // - Else → query sellers who serve rfq.categoryId (and location if applicable)
          
          let matchingSellers: Array<{
            id: string;
            email: string | null;
            fullName: string | null;
            companyName: string | null;
            categoriesServed: string | null;
            serviceArea: string | null;
          }> = [];

          const rfqCategoryId = validatedPayload.categoryId;
          const rfqLocation = validatedPayload.terms.location;

          // Declare recipients at outer scope so it's accessible to all later logic
          let recipients: Array<{
            userId?: string; // Only for claimed suppliers
            email: string;
            supplierId: string;
            displayName: string;
            isUnclaimed?: boolean; // true for unclaimed suppliers
          }> = [];

          // Check if targetSupplierIds is provided and non-empty
          // CRITICAL: targetSupplierIds now contains SUPPLIER ORGANIZATION IDs (after normalization)
          // We need to expand these to all active SupplierMember users
          if (normalizedTargetSupplierIds && normalizedTargetSupplierIds.length > 0) {
            // Find all ACTIVE SupplierMember users in the targeted supplier orgs
            const activeMembers = await prisma.supplierMember.findMany({
              where: {
                supplierId: { in: normalizedTargetSupplierIds },
                status: "ACTIVE",
              },
              include: {
                user: {
                  select: {
                    id: true,
                    email: true,
                    fullName: true,
                    companyName: true,
                    categoriesServed: true,
                    serviceArea: true,
                  },
                },
              },
            });

            // Extract user records from memberships
            matchingSellers = activeMembers
              .map(m => m.user)
              .filter((u): u is NonNullable<typeof u> => u !== null);

            // Build recipients for direct RFQs (all active members in targeted orgs)
            const directRecipientMap = new Map<string, {
              userId: string;
              email: string;
              supplierId: string;
              displayName: string;
              isUnclaimed: false;
            }>();

            for (const member of activeMembers) {
              if (!member.user.email) continue; // Skip members without email
              const key = `${member.supplierId}:${member.user.email}`;
              if (directRecipientMap.has(key)) continue; // Already added

              directRecipientMap.set(key, {
                userId: member.user.id,
                email: member.user.email,
                supplierId: member.supplierId,
                displayName: member.user.fullName || member.user.companyName || member.user.email || "Supplier",
                isUnclaimed: false,
              });
            }

            recipients = Array.from(directRecipientMap.values());
          } else {
            // Broadcast RFQ: resolve supplier orgs by category using SupplierCategoryLink (canonical source)
            // CRITICAL: SupplierCategoryLink is the canonical broadcast matching source
            // This supports both claimed suppliers (with ACTIVE members) and unclaimed suppliers (no members yet)
            
            // STEP 1: Find matching supplier orgs by categoryId using SupplierCategoryLink
            const categoryLinks = await prisma.supplierCategoryLink.findMany({
              where: {
                categoryId: rfqCategoryId, // Match by canonical categoryId
              },
              select: {
                supplierId: true,
              },
            });

            let supplierOrgIds: string[] = categoryLinks.map(link => link.supplierId);

            // Legacy fallback: if no category links found, try to find suppliers by category label
            if (supplierOrgIds.length === 0) {
              const suppliersByLabel = await prisma.supplier.findMany({
                where: {
                  category: categoryLabel.toUpperCase(), // ROOFING, etc. (display/legacy uppercase form)
                },
                select: {
                  id: true,
                },
              });
              supplierOrgIds = suppliersByLabel.map(s => s.id);
            }

            console.log("[RFQ_BROADCAST_MATCHED_SUPPLIER_ORGS]", {
              rfqId: created.id,
              categoryId: rfqCategoryId,
              supplierOrgCount: supplierOrgIds.length,
            });

            // STEP 2: For each supplier org, check if it has ACTIVE members
            // Claimed suppliers route through SupplierMember users
            // Unclaimed suppliers route through Supplier.email invite delivery
            const activeMembers = supplierOrgIds.length > 0
              ? await prisma.supplierMember.findMany({
                  where: {
                    supplierId: { in: supplierOrgIds },
                    status: "ACTIVE",
                  },
                  include: {
                    user: {
                      select: {
                        id: true,
                        email: true,
                        fullName: true,
                        companyName: true,
                      },
                    },
                    supplier: {
                      select: {
                        id: true,
                        name: true,
                        email: true,
                      },
                    },
                  },
                })
              : [];

            // Group members by supplier org
            const orgMembersMap = new Map<string, typeof activeMembers>();
            for (const member of activeMembers) {
              const orgId = member.supplierId;
              if (!orgMembersMap.has(orgId)) {
                orgMembersMap.set(orgId, []);
              }
              orgMembersMap.get(orgId)!.push(member);
            }

            // Get supplier details for all matched orgs (needed for unclaimed orgs)
            const supplierOrgs = await prisma.supplier.findMany({
              where: {
                id: { in: supplierOrgIds },
              },
              select: {
                id: true,
                name: true,
                email: true,
              },
            });

            // Build recipient list: claimed suppliers (from members) + unclaimed suppliers (from Supplier.email)
            const recipientMap = new Map<string, {
              userId?: string; // Only for claimed suppliers
              email: string;
              supplierId: string;
              displayName: string;
              isUnclaimed: boolean; // true for unclaimed suppliers
            }>();

            // Add claimed supplier recipients (from ACTIVE members)
            for (const member of activeMembers) {
              if (!member.user.email) continue; // Skip members without email
              const key = `${member.supplierId}:${member.user.email}`;
              if (recipientMap.has(key)) continue; // Already added

              recipientMap.set(key, {
                userId: member.user.id,
                email: member.user.email,
                supplierId: member.supplierId,
                displayName: member.user.fullName || member.user.companyName || member.user.email || "Supplier",
                isUnclaimed: false,
              });
            }

            // Add unclaimed supplier recipients (from Supplier.email)
            for (const supplier of supplierOrgs) {
              // Skip if this org already has active members (it's claimed)
              if (orgMembersMap.has(supplier.id)) continue;
              
              // Skip if supplier has no email
              if (!supplier.email) continue;

              const key = `${supplier.id}:${supplier.email}`;
              if (recipientMap.has(key)) continue; // Already added

              recipientMap.set(key, {
                email: supplier.email,
                supplierId: supplier.id,
                displayName: supplier.name || supplier.email || "Supplier",
                isUnclaimed: true,
              });
            }

            recipients = Array.from(recipientMap.values());

            const claimedCount = recipients.filter(r => !r.isUnclaimed).length;
            const unclaimedCount = recipients.filter(r => r.isUnclaimed).length;

            console.log("[RFQ_BROADCAST_CLAIMED_RECIPIENTS]", {
              rfqId: created.id,
              count: claimedCount,
            });

            console.log("[RFQ_BROADCAST_UNCLAIMED_RECIPIENTS]", {
              rfqId: created.id,
              count: unclaimedCount,
            });
          }

          // Log recipient resolution (for direct RFQs only - broadcast logging is above)
          if (normalizedTargetSupplierIds && normalizedTargetSupplierIds.length > 0) {
            console.log("[RFQ_NOTIFICATION_DISPATCH]", {
              rfqId: created.id,
              matchingSellerCount: matchingSellers.length,
              supplierOrgCount: normalizedTargetSupplierIds.length,
              recipientCount: recipients.length,
              routing: "targetSupplierIds",
            });
          }

          // STEP 3: Create Notification rows for claimed suppliers only (unclaimed suppliers don't have userId)
          // Unclaimed suppliers receive email invites but no in-app notifications (they don't have accounts yet)
          const { createNotification } = await import("@/lib/notifications/createNotification.server");
          const notificationPromises: Promise<string | null>[] = [];

          // Filter to only claimed recipients (those with userId)
          const claimedRecipients = recipients.filter(r => r.userId);

          if (claimedRecipients.length > 0) {
            // Batch check for existing notifications (more efficient)
            const recipientUserIds = claimedRecipients.map(r => r.userId!);
            const existingNotifications = await prisma.notification.findMany({
              where: {
                userId: { in: recipientUserIds },
                rfqId: created.id,
                type: "RFQ_CREATED",
              },
              select: {
                userId: true,
              },
            });

            const existingNotificationUserIds = new Set(
              existingNotifications.map(n => n.userId)
            );

            for (const recipient of claimedRecipients) {
              // IDEMPOTENCY CHECK: Skip if notification already exists
              if (existingNotificationUserIds.has(recipient.userId!)) {
                // Notification already exists, skip creation
                notificationPromises.push(Promise.resolve(null));
                continue;
              }

              // Create notification
              notificationPromises.push(
                createNotification({
                  userId: recipient.userId!,
                  type: "RFQ_CREATED",
                  rfqId: created.id,
                  data: {
                    rfqNumber: created.rfqNumber,
                    title: validatedPayload.title,
                    category: categoryLabel,
                    buyerName: user.fullName || user.companyName || "Buyer",
                  },
                }).catch((error) => {
                  console.error("[RFQ_NOTIFICATION_CREATE_FAILED]", {
                    rfqId: created.id,
                    userId: recipient.userId,
                    supplierId: recipient.supplierId,
                    error: error instanceof Error ? error.message : String(error),
                  });
                  return null; // Return null on error instead of throwing
                })
              );
            }
          }

          // Create all notifications in parallel (don't block on failures)
          const notificationResults = await Promise.allSettled(notificationPromises);
          const notificationsCreated = notificationResults.filter(
            r => r.status === "fulfilled" && r.value !== null
          ).length;

          // STEP 4: Dispatch email to both claimed and unclaimed suppliers
          // Claimed suppliers → rfq-created notification email
          // Unclaimed suppliers → onboarding invite email with account creation link
          const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
          const emailPromises: Promise<{ ok: boolean; error?: string }>[] = [];

          for (const recipient of recipients) {
            if (!recipient.email) continue; // Skip recipients without email

            // Branch: unclaimed suppliers get onboarding email, claimed suppliers get RFQ notification
            if (recipient.isUnclaimed === true) {
              // Unclaimed supplier: send onboarding email with invite token
              const onboardingPromise = sendSupplierOnboardingEmail({
                to: recipient.email,
                supplierName: recipient.displayName,
                buyerName: user.fullName || user.companyName || "Buyer",
                messagePreview: validatedPayload.title,
                supplierId: recipient.supplierId,
                rfqId: created.id,
              })
                .then(() => {
                  console.log("[RFQ_UNCLAIMED_SUPPLIER_INVITE_SENT]", {
                    rfqId: created.id,
                    supplierId: recipient.supplierId,
                    email: recipient.email,
                  });
                  return { ok: true };
                })
                .catch((error) => {
                  console.error("[RFQ_UNCLAIMED_SUPPLIER_INVITE_FAILED]", {
                    rfqId: created.id,
                    supplierId: recipient.supplierId,
                    email: recipient.email,
                    error: error instanceof Error ? error.message : String(error),
                  });
                  return { ok: false, error: error.message };
                });

              emailPromises.push(onboardingPromise);
            } else {
              // Claimed supplier: send RFQ notification email via existing endpoint
              // IDEMPOTENCY KEY: rfq:{rfq.id}:supplier:{supplierOrgId}:to:{recipientEmail}
              const idempotencyKey = `rfq:${created.id}:supplier:${recipient.supplierId}:to:${recipient.email}`;

              const emailPromise = fetch(`${baseUrl}/api/notifications/rfq-created`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "Idempotency-Key": idempotencyKey,
                },
                body: JSON.stringify({
                  rfq: {
                    id: created.id,
                    buyerName: user.fullName || user.companyName || "Buyer",
                    category: categoryLabel,
                    title: validatedPayload.title,
                    description: validatedPayload.notes || undefined,
                    createdAt: created.createdAt.toISOString(),
                    dueAt: validatedPayload.terms.requestedDate,
                    location: validatedPayload.terms.location,
                    urlPath: `/seller/feed?category=${encodeURIComponent(categoryLabel)}`,
                  },
                  supplier: {
                    id: recipient.supplierId, // Use supplier org ID
                    email: recipient.email, // Use recipient email (member email for claimed)
                    name: recipient.displayName,
                  },
                }),
              })
                .then(async (response) => {
                  const result = await response.json();
                  if (result.ok) {
                    // Log exactly once per recipient
                    console.log("[RFQ_NOTIFICATION_SENT]", {
                      rfqId: created.id,
                      userId: recipient.userId || null,
                      supplierId: recipient.supplierId,
                      email: recipient.email,
                      isUnclaimed: false,
                    });
                    return { ok: true };
                  } else {
                    throw new Error(result.error || "Email send failed");
                  }
                })
                .catch((error) => {
                  console.error("[RFQ_EMAIL_FAILED]", {
                    rfqId: created.id,
                    userId: recipient.userId || null,
                    supplierId: recipient.supplierId,
                    recipientEmail: recipient.email,
                    isUnclaimed: false,
                    error: error instanceof Error ? error.message : String(error),
                  });
                  return { ok: false, error: error.message };
                });

              emailPromises.push(emailPromise);
            }
          }

          // Send all emails in parallel (don't block on failures)
          const emailResults = await Promise.allSettled(emailPromises);
          const emailsSent = emailResults.filter(r => r.status === "fulfilled" && r.value.ok).length;
          const emailsFailed = emailResults.filter(r => r.status === "rejected" || (r.status === "fulfilled" && !r.value.ok)).length;

          console.log("[RFQ_NOTIFICATION_DISPATCH_COMPLETE]", {
            rfqId: created.id,
            recipientCount: recipients.length,
            notificationsCreated,
            emailsSent,
            emailsFailed,
          });
        } catch (error) {
          // Never fail RFQ creation due to notification errors
          console.error("❌ RFQ_NOTIFICATION_DISPATCH_ERROR", {
            rfqId: created.id,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      });
    }

    // Return immediately after DB create (don't await supplier count or notifications)
    console.log("[RFQ_CREATE_RETURNED]", {
      rfqId: created.id,
    });
    
    return jsonOk(responseBody, 201);
  });
}

