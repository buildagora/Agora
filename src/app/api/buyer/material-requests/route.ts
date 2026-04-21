import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { getPrisma } from "@/lib/db.server";
import { jsonError, withErrorHandling } from "@/lib/apiResponse";
import { verifyAuthToken, getAuthCookieName } from "@/lib/jwt";
import { requireCurrentUserFromRequest } from "@/lib/auth/server";
import { categoryIdToLabel } from "@/lib/categoryIds";
import { sendEmail } from "@/lib/email.server";
import { trackServerEvent } from "@/lib/analytics/server";
import { ANALYTICS_EVENTS } from "@/lib/analytics/events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/buyer/material-requests
 * 
 * Returns the authenticated buyer's material requests with recipient counts.
 */
export async function GET(request: NextRequest) {
  return withErrorHandling(async () => {
    let user;
    try {
      user = await requireCurrentUserFromRequest(request);
    } catch {
      return jsonError("UNAUTHORIZED", "Authentication required", 401);
    }

    if (user.role !== "BUYER") {
      return jsonError("FORBIDDEN", "Buyer access required", 403);
    }

    const prisma = getPrisma();

    // Load buyer's material requests
    const requests = await prisma.materialRequest.findMany({
      where: { buyerId: user.id },
      orderBy: { createdAt: "desc" },
      include: {
        recipients: {
          select: {
            status: true,
          },
        },
      },
    });

    // Calculate counts for each request
    const requestsWithCounts = requests.map((req) => {
      const recipients = req.recipients;
      const totalRecipients = recipients.length;
      const repliedCount = recipients.filter((r) => r.status === "REPLIED").length;
      const pendingCount = recipients.filter((r) => r.status === "SENT" || r.status === "VIEWED").length;
      const declinedCount = recipients.filter(
        (r) => r.status === "DECLINED" || r.status === "OUT_OF_STOCK" || r.status === "NO_RESPONSE"
      ).length;

      return {
        id: req.id,
        categoryId: req.categoryId,
        requestText: req.requestText,
        sendMode: req.sendMode,
        status: req.status,
        createdAt: req.createdAt.toISOString(),
        updatedAt: req.updatedAt.toISOString(),
        counts: {
          totalRecipients,
          repliedCount,
          pendingCount,
          declinedCount,
        },
      };
    });

    return NextResponse.json({
      ok: true,
      data: requestsWithCounts,
    });
  });
}

const OPERATOR_MATERIAL_REQUEST_EMAIL = "buildagora@gmail.com";

const NOMINATIM_USER_AGENT = "AgoraLocalDev/1.0 (buildagora@gmail.com)";

/** Great-circle distance between two WGS84 points, in miles. */
function haversineMiles(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const earthMi = 3958.8;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthMi * c;
}

/**
 * Approximate request coordinates from city / region / country via Nominatim (US).
 * Returns null if lookup fails or location data is unusable.
 */
async function resolveRequestCoordinates(
  locationCity: string | null,
  locationRegion: string | null,
  locationCountry: string | null
): Promise<{ latitude: number; longitude: number } | null> {
  const city = typeof locationCity === "string" ? locationCity.trim() : "";
  const region = typeof locationRegion === "string" ? locationRegion.trim() : "";
  const country =
    typeof locationCountry === "string" ? locationCountry.trim() : "";
  const q = [city, region, country].filter(Boolean).join(", ");
  if (!q) return null;

  try {
    const params = new URLSearchParams({
      format: "jsonv2",
      limit: "1",
      countrycodes: "us",
      q,
    });
    const url = `https://nominatim.openstreetmap.org/search?${params}`;
    const res = await fetch(url, {
      headers: { "User-Agent": NOMINATIM_USER_AGENT },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Array<{ lat?: string; lon?: string }>;
    if (!Array.isArray(data) || data.length === 0) return null;
    const lat = Number.parseFloat(String(data[0].lat));
    const lon = Number.parseFloat(String(data[0].lon));
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    return { latitude: lat, longitude: lon };
  } catch {
    return null;
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * POST /api/buyer/material-requests
 *
 * Creates a material request and recipient rows for matched suppliers.
 * Supplier conversations are created for schema/FK only; no messages or supplier emails
 * (operator-assisted flow — operator notified via email).
 */
export async function POST(request: NextRequest) {
  return withErrorHandling(async () => {
    const fail = async (
      errorCode: string,
      status: number,
      message: string,
      props?: Record<string, string | number | boolean | null>
    ) => {
      await trackServerEvent(ANALYTICS_EVENTS.request_submission_failed, {
        error_code: errorCode.toLowerCase(),
        ...props,
      });
      return jsonError(errorCode, message, status);
    };

    // Read auth cookie — authenticated buyers use JWT; anonymous callers use shared ghost buyer
    const cookieName = getAuthCookieName();
    const token = request.cookies.get(cookieName)?.value;

    const prisma = getPrisma();

    type DbUserRow = {
      id: string;
      role: string;
      fullName: string | null;
      companyName: string | null;
    };

    let dbUser: DbUserRow | undefined;

    if (token) {
      const payload = await verifyAuthToken(token);
      if (payload) {
        const loaded = await prisma.user.findUnique({
          where: { id: payload.userId },
          select: { id: true, role: true, fullName: true, companyName: true },
        });
        if (loaded?.role === "BUYER") {
          dbUser = loaded;
        }
      }
    }

    // Parse request body
    let body;
    try {
      body = await request.json();
    } catch {
      return fail("BAD_REQUEST", 400, "Invalid JSON");
    }

    const { categoryId, requestText, sendMode, supplierIds } = body;

    // Validate required fields
    if (!categoryId || typeof categoryId !== "string" || !categoryId.trim()) {
      return fail("BAD_REQUEST", 400, "categoryId is required");
    }

    if (!requestText || typeof requestText !== "string" || !requestText.trim()) {
      return fail("BAD_REQUEST", 400, "requestText is required");
    }

    if (!sendMode || (sendMode !== "NETWORK" && sendMode !== "DIRECT")) {
      return fail("BAD_REQUEST", 400, "sendMode must be NETWORK or DIRECT");
    }

    // Validate DIRECT mode requirements
    if (sendMode === "DIRECT") {
      if (!Array.isArray(supplierIds) || supplierIds.length === 0) {
        return fail("BAD_REQUEST", 400, "supplierIds array is required for DIRECT mode");
      }
    }

    // Normalize category ID
    const normalizedCategoryId = categoryId.trim().toLowerCase();

    const headerStore = await headers();
    const rawCity = headerStore.get("x-vercel-ip-city");
    const rawRegion = headerStore.get("x-vercel-ip-country-region");
    const rawCountry = headerStore.get("x-vercel-ip-country");
    const decodeGeo = (raw: string | null) => {
      if (raw == null || raw === "") return null;
      try {
        return decodeURIComponent(raw.replace(/\+/g, " "));
      } catch {
        return raw;
      }
    };
    let locationCity = decodeGeo(rawCity);
    let locationRegion = decodeGeo(rawRegion);
    let locationCountry = decodeGeo(rawCountry);

    if (
      process.env.NODE_ENV === "development" &&
      !locationCity?.trim() &&
      !locationRegion?.trim() &&
      !locationCountry?.trim()
    ) {
      locationCity = "Huntsville";
      locationRegion = "AL";
      locationCountry = "US";
    }

    const requestCoords = await resolveRequestCoordinates(
      locationCity,
      locationRegion,
      locationCountry
    );

    // Resolve target suppliers
    let targetSuppliers: Array<{ id: string; name: string }> = [];

    if (sendMode === "NETWORK") {
      // NETWORK: Find all suppliers with matching category via SupplierCategoryLink
      let suppliers = await prisma.supplier.findMany({
        where: {
          categoryLinks: {
            some: {
              categoryId: normalizedCategoryId,
            },
          },
        },
        select: {
          id: true,
          name: true,
          latitude: true,
          longitude: true,
        },
      });

      if (requestCoords) {
        const withCoords = suppliers.filter(
          (s) => s.latitude != null && s.longitude != null
        );
        const withoutCoords = suppliers.filter(
          (s) => s.latitude == null || s.longitude == null
        );
        withCoords.sort((a, b) => {
          const da = haversineMiles(
            requestCoords.latitude,
            requestCoords.longitude,
            a.latitude!,
            a.longitude!
          );
          const db = haversineMiles(
            requestCoords.latitude,
            requestCoords.longitude,
            b.latitude!,
            b.longitude!
          );
          return da - db;
        });
        suppliers = [...withCoords, ...withoutCoords];
      } else {
        suppliers.sort((a, b) => a.name.localeCompare(b.name));
      }

      targetSuppliers = suppliers.map(({ id, name }) => ({ id, name }));
    } else {
      // DIRECT: Fetch only selected suppliers
      const supplierIdsArray = supplierIds as string[];
      const suppliers = await prisma.supplier.findMany({
        where: {
          id: { in: supplierIdsArray },
        },
        select: {
          id: true,
          name: true,
        },
      });

      // Validate that all requested suppliers exist
      if (suppliers.length !== supplierIdsArray.length) {
        return fail("BAD_REQUEST", 400, "One or more supplier IDs are invalid");
      }

      targetSuppliers = suppliers;
    }

    if (targetSuppliers.length === 0) {
      return fail("BAD_REQUEST", 400, "No suppliers found for the specified criteria", {
        category_id: normalizedCategoryId,
        send_mode: sendMode.toLowerCase(),
      });
    }

    let effectiveBuyer: DbUserRow | undefined = dbUser;

    if (!effectiveBuyer) {
      const foundGhost = await prisma.user.findFirst({
        where: { email: "anonymous@agora.com" },
        select: {
          id: true,
          role: true,
          fullName: true,
          companyName: true,
        },
      });

      effectiveBuyer =
        foundGhost ??
        (await prisma.user.create({
          data: {
            email: "anonymous@agora.com",
            passwordHash: "",
            role: "BUYER",
            emailVerified: false,
          },
          select: {
            id: true,
            role: true,
            fullName: true,
            companyName: true,
          },
        }));
    }

    if (!effectiveBuyer) {
      return fail("INTERNAL", 500, "Unable to resolve buyer for material request");
    }

    console.log("Creating request:", {
      buyerId: effectiveBuyer.id,
      categoryId: normalizedCategoryId,
      requestText: requestText.trim(),
      locationCity,
      locationRegion,
      locationCountry,
    });

    const materialRequest = await prisma.materialRequest.create({
      data: {
        buyerId: effectiveBuyer.id,
        categoryId: normalizedCategoryId,
        requestText: requestText.trim(),
        sendMode,
        supplierIdsJson: sendMode === "DIRECT" ? JSON.stringify(supplierIds) : null,
        locationCity: locationCity || null,
        locationRegion: locationRegion || null,
        locationCountry: locationCountry || null,
        latitude: requestCoords?.latitude ?? null,
        longitude: requestCoords?.longitude ?? null,
      },
    });

    // For each target supplier: conversation row (required FK for MaterialRequestRecipient)
    // + recipient row. No supplier messages, emails, or in-app notifications (operator-assisted flow).
    const recipientResults: Array<{ supplierId: string; conversationId: string }> = [];

    const conversationTitle = requestText.trim().substring(0, 80);
    const now = new Date();

    console.log("Target suppliers:", targetSuppliers);

    for (const supplier of targetSuppliers) {
      try {
        await prisma.$transaction(async (tx) => {
          const conversation = await tx.supplierConversation.create({
            data: {
              buyerId: effectiveBuyer.id,
              supplierId: supplier.id,
              rfqId: null,
              materialRequestId: materialRequest.id,
              title: conversationTitle,
            },
          });

          await tx.materialRequestRecipient.create({
            data: {
              materialRequestId: materialRequest.id,
              supplierId: supplier.id,
              conversationId: conversation.id,
              status: "SENT",
              sentAt: now,
              statusUpdatedAt: now,
            },
          });

          recipientResults.push({
            supplierId: supplier.id,
            conversationId: conversation.id,
          });
        });
      } catch (error) {
        console.error("FAILED TO CREATE RECIPIENT:", {
          supplierId: supplier.id,
          requestId: materialRequest.id,
          error,
        });

        throw error;
      }
    }

    if (recipientResults.length === 0) {
      throw new Error("No recipients were created for this request");
    }

    const categoryLabel =
      categoryIdToLabel[normalizedCategoryId as keyof typeof categoryIdToLabel] ||
      normalizedCategoryId;
    const buyerDisplayName =
      effectiveBuyer?.fullName?.trim() ||
      effectiveBuyer?.companyName?.trim() ||
      "—";
    const submittedAt = materialRequest.createdAt.toISOString();

    try {
      await sendEmail({
        to: OPERATOR_MATERIAL_REQUEST_EMAIL,
        subject: "New Material Request (Agora)",
        html: `
          <h2 style="margin:0 0 12px;font-size:18px;">New Material Request (Agora)</h2>
          <p style="margin:8px 0;"><strong>Buyer:</strong> ${escapeHtml(buyerDisplayName)}</p>
          <p style="margin:8px 0;"><strong>Category:</strong> ${escapeHtml(categoryLabel)}</p>
          <p style="margin:8px 0;"><strong>Request:</strong></p>
          <pre style="white-space:pre-wrap;font-family:inherit;margin:8px 0;padding:12px;background:#f4f4f5;border-radius:8px;">${escapeHtml(requestText.trim())}</pre>
          <p style="margin:8px 0;"><strong>Timestamp:</strong> ${escapeHtml(submittedAt)}</p>
          <p style="margin:8px 0;font-size:12px;color:#71717a;">Request ID: ${escapeHtml(materialRequest.id)}</p>
        `,
        text: [
          "New Material Request (Agora)",
          "",
          `Buyer: ${buyerDisplayName}`,
          `Category: ${categoryLabel}`,
          "",
          "Request:",
          requestText.trim(),
          "",
          `Timestamp: ${submittedAt}`,
          `Request ID: ${materialRequest.id}`,
        ].join("\n"),
      });
      console.log("[MATERIAL_REQUEST_OPERATOR_EMAIL_SENT]", {
        materialRequestId: materialRequest.id,
        to: OPERATOR_MATERIAL_REQUEST_EMAIL,
      });
    } catch (emailError) {
      console.error("[MATERIAL_REQUEST_OPERATOR_EMAIL_FAILED]", {
        materialRequestId: materialRequest.id,
        error: emailError instanceof Error ? emailError.message : String(emailError),
      });
    }

    console.log("[MATERIAL_REQUEST_CREATED]", {
      materialRequestId: materialRequest.id,
      buyerId: effectiveBuyer.id,
      categoryId: normalizedCategoryId,
      sendMode: sendMode,
      supplierCount: recipientResults.length,
    });

    try {
      await trackServerEvent(ANALYTICS_EVENTS.request_submitted, {
        category_id: normalizedCategoryId,
        send_mode: sendMode.toLowerCase(),
        recipient_count: recipientResults.length,
      });
    } catch (analyticsError) {
      console.error("[MATERIAL_REQUEST_ANALYTICS_FAILED]", {
        materialRequestId: materialRequest.id,
        error:
          analyticsError instanceof Error
            ? analyticsError.message
            : String(analyticsError),
      });
    }

    return NextResponse.json({
      ok: true,
      materialRequestId: materialRequest.id,
      supplierCount: recipientResults.length,
      supplierIds: recipientResults.map((r) => r.supplierId),
    });
  });
}


