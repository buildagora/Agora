/**
 * Buyer RFQ List API
 * Returns all RFQs for the authenticated buyer
 */

import { NextRequest, NextResponse } from "next/server";
import { requireServerEnv } from "@/lib/env";
import { jsonOk, jsonError, withErrorHandling, type ApiSuccess } from "@/lib/apiResponse";
import { requireCurrentUserFromRequest } from "@/lib/auth/server";
import { getPrisma } from "@/lib/db.server";

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
        targetSupplierIds: validatedPayload.targetSupplierIds 
          ? JSON.stringify(validatedPayload.targetSupplierIds) 
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
      ok: true,
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

          // Check if targetSupplierIds is provided and non-empty
          if (validatedPayload.targetSupplierIds && validatedPayload.targetSupplierIds.length > 0) {
            // Use target supplier IDs
            matchingSellers = await prisma.user.findMany({
              where: {
                role: "SELLER",
                id: {
                  in: validatedPayload.targetSupplierIds,
                },
              },
              select: {
                id: true,
                email: true,
                fullName: true,
                companyName: true,
                categoriesServed: true,
                serviceArea: true,
              },
            });
          } else {
            // Broadcast RFQ: resolve sellers by category + location
            const allSellers = await prisma.user.findMany({
              where: {
                role: "SELLER",
                categoriesServed: {
                  not: null,
                },
              },
              select: {
                id: true,
                email: true,
                fullName: true,
                companyName: true,
                categoriesServed: true,
                serviceArea: true,
              },
            });

            // Filter by category match
            matchingSellers = allSellers.filter((seller) => {
              if (!seller.categoriesServed) return false;
              try {
                const categories = JSON.parse(seller.categoriesServed);
                if (!Array.isArray(categories)) return false;
                const categoryMatch = categories.some((cat: string) => {
                  const v = String(cat).trim();
                  // Match by categoryId (canonical)
                  if (v === rfqCategoryId) return true;
                  // Match by label (legacy)
                  return v.toLowerCase().trim() === (categoryLabel || "").toLowerCase().trim();
                });
                if (!categoryMatch) return false;

                // If location is provided, filter by serviceArea
                if (rfqLocation && seller.serviceArea) {
                  try {
                    const serviceAreas = JSON.parse(seller.serviceArea);
                    if (Array.isArray(serviceAreas) && serviceAreas.length > 0) {
                      // Check if RFQ location matches any service area
                      const locationMatch = serviceAreas.some((area: string) => {
                        const normalizedArea = String(area).toLowerCase().trim();
                        const normalizedLocation = rfqLocation.toLowerCase().trim();
                        return normalizedLocation.includes(normalizedArea) || normalizedArea.includes(normalizedLocation);
                      });
                      return locationMatch;
                    }
                  } catch {
                    // Invalid serviceArea JSON, include seller (don't filter by location)
                  }
                }

                return true; // Category matches, location check passed or not applicable
              } catch {
                return false;
              }
            });
          }

          // Log recipient resolution
          console.log("[RFQ_NOTIFICATION_DISPATCH]", {
            rfqId: created.id,
            recipientCount: matchingSellers.length,
            routing: validatedPayload.targetSupplierIds && validatedPayload.targetSupplierIds.length > 0 
              ? "targetSupplierIds" 
              : "category+location",
          });

          // STEP 2: Create Notification rows for each supplier (with idempotency check)
          const { createNotification } = await import("@/lib/notifications/createNotification.server");
          const notificationPromises: Promise<string | null>[] = [];

          // Batch check for existing notifications (more efficient)
          const sellerIds = matchingSellers.map(s => s.id);
          const existingNotifications = await prisma.notification.findMany({
            where: {
              userId: { in: sellerIds },
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

          for (const seller of matchingSellers) {
            // IDEMPOTENCY CHECK: Skip if notification already exists
            if (existingNotificationUserIds.has(seller.id)) {
              // Notification already exists, skip creation
              notificationPromises.push(Promise.resolve(null));
              continue;
            }

            // Create notification
            notificationPromises.push(
              createNotification({
                userId: seller.id,
                type: "RFQ_CREATED", // Use RFQ_CREATED as specified
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
                  supplierId: seller.id,
                  error: error instanceof Error ? error.message : String(error),
                });
                return null; // Return null on error instead of throwing
              })
            );
          }

          // Create all notifications in parallel (don't block on failures)
          const notificationResults = await Promise.allSettled(notificationPromises);
          const notificationsCreated = notificationResults.filter(
            r => r.status === "fulfilled" && r.value !== null
          ).length;

          // STEP 3: Dispatch email by calling the existing RFQ-created email logic
          // Use idempotency key: `rfq:{rfq.id}:supplier:{supplier.id}`
          const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
          const emailPromises: Promise<{ ok: boolean; error?: string }>[] = [];

          for (const seller of matchingSellers) {
            if (!seller.email) continue; // Skip sellers without email

            // IDEMPOTENCY KEY: rfq:{rfq.id}:supplier:{supplier.id}
            const idempotencyKey = `rfq:${created.id}:supplier:${seller.id}`;

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
                  id: seller.id,
                  email: seller.email,
                  name: seller.fullName || seller.companyName || undefined,
                },
              }),
            })
              .then(async (response) => {
                const result = await response.json();
                if (result.ok) {
                  // Log exactly once per supplier
                  console.log("[RFQ_NOTIFICATION_SENT]", {
                    rfqId: created.id,
                    supplierId: seller.id,
                    email: seller.email,
                  });
                  return { ok: true };
                } else {
                  throw new Error(result.error || "Email send failed");
                }
              })
              .catch((error) => {
                console.error("[RFQ_EMAIL_FAILED]", {
                  rfqId: created.id,
                  supplierId: seller.id,
                  supplierEmail: seller.email,
                  error: error instanceof Error ? error.message : String(error),
                });
                return { ok: false, error: error.message };
              });

            emailPromises.push(emailPromise);
          }

          // Send all emails in parallel (don't block on failures)
          const emailResults = await Promise.allSettled(emailPromises);
          const emailsSent = emailResults.filter(r => r.status === "fulfilled" && r.value.ok).length;
          const emailsFailed = emailResults.filter(r => r.status === "rejected" || (r.status === "fulfilled" && !r.value.ok)).length;

          console.log("[RFQ_NOTIFICATION_DISPATCH_COMPLETE]", {
            rfqId: created.id,
            recipientCount: matchingSellers.length,
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
    
    return NextResponse.json(
      responseBody,
      {
        status: 201, // Created
        headers: { "Content-Type": "application/json" },
      }
    );
  });
}

