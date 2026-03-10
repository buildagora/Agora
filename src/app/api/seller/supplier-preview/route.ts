/**
 * GET /api/seller/supplier-preview?supplierId=<id>
 * Public API route to fetch supplier preview data for claim signup
 * 
 * This endpoint is used by /seller/signup to prefill form fields
 * from an existing seeded supplier record.
 */

import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/db.server";
import { jsonError } from "@/lib/apiResponse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const supplierId = searchParams.get("supplierId");

    if (!supplierId) {
      return jsonError("BAD_REQUEST", "supplierId query parameter is required", 400);
    }

    const prisma = getPrisma();

    // Fetch supplier by ID
    const supplier = await prisma.supplier.findUnique({
      where: { id: supplierId },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        category: true,
      },
    });

    if (!supplier) {
      return jsonError("NOT_FOUND", "Supplier not found", 404);
    }

    // Return supplier preview data (safe to expose publicly)
    return NextResponse.json({
      ok: true,
      supplier: {
        id: supplier.id,
        name: supplier.name,
        email: supplier.email,
        phone: supplier.phone,
        category: supplier.category,
      },
    });
  } catch (error) {
    console.error("[SUPPLIER_PREVIEW_ERROR]", {
      error: error instanceof Error ? error.message : String(error),
    });
    return jsonError("INTERNAL_ERROR", "Failed to fetch supplier preview", 500);
  }
}

