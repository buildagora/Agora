/**
 * Buyer RFQ Detail API
 * Returns a single RFQ by ID for the authenticated buyer
 * Server-side, single source of truth from database
 */

import { NextRequest, NextResponse } from "next/server";
import { requireServerEnv } from "@/lib/env";
import { jsonOk, jsonError, withErrorHandling } from "@/lib/apiResponse";
import { requireCurrentUserFromRequest } from "@/lib/auth/server";
import { getPrisma } from "@/lib/db.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ rfqId: string }> }
) {
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

    const { rfqId: id } = await params;

    // Query RFQ from database (server-side, single source of truth)
    // CRITICAL: Must include buyerId check for ownership
    const prisma = getPrisma();
    const dbRfq = await prisma.rFQ.findFirst({
      where: { 
        id: id,
        buyerId: user.id, // Ownership check - only buyer's own RFQs
      },
    });

    // CRITICAL: Log RFQ detail fetch (always, not just dev)
    console.log("[RFQ_DETAIL_FETCH]", {
      requestedId: id,
      found: !!dbRfq,
      buyerId: user.id,
    });

    if (!dbRfq) {
      return jsonError("NOT_FOUND", "RFQ not found", 404);
    }

    // Parse JSON fields from database
    let lineItems: any[] = [];
    let terms: any = {};
    let targetSupplierIds: string[] = [];

    try {
      lineItems = dbRfq.lineItems ? JSON.parse(dbRfq.lineItems) : [];
    } catch {
      lineItems = [];
    }

    try {
      terms = dbRfq.terms ? JSON.parse(dbRfq.terms) : {};
    } catch {
      terms = {};
    }

    try {
      targetSupplierIds = dbRfq.targetSupplierIds ? JSON.parse(dbRfq.targetSupplierIds) : [];
    } catch {
      targetSupplierIds = [];
    }

    // Return RFQ in expected format
    const rfq = {
      id: dbRfq.id,
      rfqNumber: dbRfq.rfqNumber,
      status: dbRfq.status,
      createdAt: dbRfq.createdAt.toISOString(),
      title: dbRfq.title,
      notes: dbRfq.notes || "",
      category: dbRfq.category,
      categoryId: dbRfq.categoryId || null,
      buyerId: dbRfq.buyerId,
      jobNameOrPo: dbRfq.jobNameOrPo || null,
      visibility: dbRfq.visibility as "broadcast" | "direct" | undefined,
      targetSupplierIds,
      lineItems,
      terms,
      awardedBidId: dbRfq.awardedBidId || null,
      awardedAt: dbRfq.awardedAt?.toISOString() || null,
    };

    return jsonOk(rfq, 200);
  });
}

/**
 * Delete RFQ endpoint
 * DATABASE-FIRST: Deletes from database, not localStorage
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ rfqId: string }> }
) {
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

    const { rfqId: id } = await params;

    // Verify ownership before deletion
    const prisma = getPrisma();
    const dbRfq = await prisma.rFQ.findFirst({
      where: { 
        id: id,
        buyerId: user.id, // Ownership check
      },
    });

    if (!dbRfq) {
      return jsonError("NOT_FOUND", "RFQ not found", 404);
    }

    // Delete from database
    await prisma.rFQ.delete({
      where: { id: id },
    });

    return NextResponse.json(
      { ok: true, message: "RFQ deleted" },
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  });
}

