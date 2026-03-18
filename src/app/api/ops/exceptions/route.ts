/**
 * Ops Exceptions API Route
 * Server-only endpoint that detects and returns all active exceptions
 */

import { NextRequest, NextResponse } from "next/server";
import { requireCurrentUserFromRequest } from "@/lib/auth/server";
import { getPrisma } from "@/lib/db.server";
import { getDispatchRecords } from "@/lib/requestDispatch";
import { getOrderByRequestId } from "@/lib/order";
import { detectAllExceptions, type Exception } from "@/lib/exceptionDetection";
import { rfqToRequest } from "@/lib/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    // Auth check - only authenticated users can access
    const user = await requireCurrentUserFromRequest(request);
    
    // TODO: Add role check if needed (e.g., only ops/admin can access)
    // if (user.role !== "ADMIN" && user.role !== "OPS") {
    //   return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    // }

    // Load all RFQs from database
    const prisma = getPrisma();
    const rfqs = await prisma.rFQ.findMany({
      where: {
        status: {
          in: ["OPEN", "PUBLISHED", "AWARDED"],
        },
      },
      include: {
        buyer: {
          select: {
            id: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    // Detect all exceptions
    const allExceptions: Exception[] = [];
    const now = new Date().toISOString();

    for (const rfq of rfqs) {
      try {
        // Convert RFQ to Request format
        const request = rfqToRequest({
          id: rfq.id,
          rfqNumber: rfq.rfqNumber,
          status: rfq.status,
          buyerId: rfq.buyer.id,
          jobName: rfq.title,
          items: JSON.parse(rfq.lineItems || "[]"),
          delivery: JSON.parse(rfq.terms || "{}"),
          createdAt: rfq.createdAt.toISOString(),
          updatedAt: (rfq as any).updatedAt?.toISOString() || rfq.createdAt.toISOString(),
        });

        // Get dispatch records for this request
        const dispatchRecords = getDispatchRecords(request.id);
        
        // Get order if exists
        const order = getOrderByRequestId(request.id, rfq.buyer.id);
        
        // Detect exceptions
        const detectedExceptions = detectAllExceptions({
          request,
          dispatchRecords,
          order,
          now,
        });
        
        // Only include active (non-resolved) exceptions
        const activeExceptions = detectedExceptions.filter((ex) => !ex.isResolved);
        allExceptions.push(...activeExceptions);
      } catch (error) {
        // Silently fail for this request
        if (process.env.NODE_ENV === "development") {
          console.error("Error detecting exceptions for RFQ:", rfq.id, error);
        }
      }
    }

    // Sort by severity (critical > warning > info) and then by age (oldest first)
    allExceptions.sort((a, b) => {
      const severityOrder = { critical: 3, warning: 2, info: 1 };
      const severityDiff = (severityOrder[b.severity] || 0) - (severityOrder[a.severity] || 0);
      if (severityDiff !== 0) return severityDiff;
      
      const ageA = new Date(a.createdAt).getTime();
      const ageB = new Date(b.createdAt).getTime();
      return ageA - ageB; // Oldest first
    });

    return NextResponse.json({
      ok: true,
      exceptions: allExceptions,
    });
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("Error loading exceptions:", error);
    }
    return NextResponse.json(
      { ok: false, error: "Failed to load exceptions" },
      { status: 500 }
    );
  }
}




