/**
 * Buyer Orders API
 * Returns all orders for the authenticated buyer
 */

import { NextRequest } from "next/server";
import { requireServerEnv } from "@/lib/env";
import { jsonOk, jsonError, withErrorHandling } from "@/lib/apiResponse";
import { requireCurrentUserFromRequest } from "@/lib/auth/server";
import { getPrisma } from "@/lib/db.server";

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

    // Support optional rfqId filter
    const { searchParams } = new URL(request.url);
    const rfqId = searchParams.get("rfqId");

    // Query orders from database with buyer relation
    const prisma = getPrisma();
    const dbOrders = await prisma.order.findMany({
      where: {
        buyerId: user.id,
        ...(rfqId && { rfqId }),
      },
      include: {
        buyer: {
          select: {
            id: true,
            fullName: true,
            companyName: true,
            email: true,
            phone: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // Fetch bids separately to get seller info (Order doesn't have bid relation)
    const bidIds = dbOrders.map((o) => o.bidId).filter((id): id is string => Boolean(id));
    const bids = bidIds.length > 0
      ? await prisma.bid.findMany({
          where: { id: { in: bidIds } },
          include: {
            seller: {
              select: {
                id: true,
                fullName: true,
                companyName: true,
                email: true,
              },
            },
          },
        })
      : [];

    // Build bidById map for quick lookup
    const bidById = new Map(bids.map((bid) => [bid.id, bid]));

    // Resolve supplier organization names for all seller users
    // Step 1: Get unique seller user IDs from bids
    const sellerUserIds = [...new Set(bids.map((bid) => bid.sellerId).filter(Boolean))];
    
    // Step 2: Fetch SupplierMember records for these seller users
    const supplierMembers = sellerUserIds.length > 0
      ? await prisma.supplierMember.findMany({
          where: {
            userId: { in: sellerUserIds },
            status: "ACTIVE", // Only active members
          },
          select: {
            userId: true,
            supplierId: true,
          },
        })
      : [];

    // Step 3: Get unique supplier IDs and fetch Supplier records
    const supplierIds = [...new Set(supplierMembers.map((m) => m.supplierId))];
    const suppliers = supplierIds.length > 0
      ? await prisma.supplier.findMany({
          where: { id: { in: supplierIds } },
          select: {
            id: true,
            name: true,
          },
        })
      : [];

    // Step 4: Build lookup maps
    // Map: userId -> supplierId
    const supplierIdByUserId = new Map(
      supplierMembers.map((m) => [m.userId, m.supplierId])
    );
    // Map: supplierId -> Supplier.name
    const supplierNameById = new Map(
      suppliers.map((s) => [s.id, s.name])
    );

    // Helper function to resolve seller name with priority: Supplier.name -> user.companyName -> user.fullName -> user.email -> "Seller"
    const resolveSellerName = (sellerUserId: string | null, seller: { fullName: string | null; companyName: string | null; email: string } | null): string => {
      if (!sellerUserId || !seller) {
        return "Seller";
      }

      // Try to get supplier organization name first
      const supplierId = supplierIdByUserId.get(sellerUserId);
      if (supplierId) {
        const supplierName = supplierNameById.get(supplierId);
        if (supplierName) {
          return supplierName;
        }
      }

      // Fall back to user-level values
      return seller.companyName || seller.fullName || seller.email || "Seller";
    };

    // Parse JSON fields and return with buyer/seller info
    const orders = dbOrders.map(order => {
      const bid = order.bidId ? bidById.get(order.bidId) : null;
      const buyerName = order.buyer?.fullName || order.buyer?.companyName || order.buyer?.email || "Buyer";
      const buyerPhone = order.buyer?.phone || null;
      const sellerName = resolveSellerName(bid?.sellerId || null, bid?.seller || null);
      const orderNumber = `PO-${order.id.slice(0, 8).toUpperCase()}`;

      return {
        id: order.id,
        rfqId: order.rfqId,
        bidId: order.bidId,
        status: order.status,
        createdAt: order.createdAt.toISOString(),
        updatedAt: order.updatedAt.toISOString(),
        lineItems: order.lineItems ? JSON.parse(order.lineItems) : [],
        subtotal: order.subtotal,
        taxes: order.taxes,
        total: order.total,
        fulfillmentType: order.fulfillmentType,
        requestedDate: order.requestedDate,
        deliveryPreference: order.deliveryPreference,
        deliveryInstructions: order.deliveryInstructions,
        location: order.location,
        notes: order.notes,
        buyerName,
        buyerPhone,
        sellerName,
        orderNumber,
      };
    });

    return jsonOk(orders, 200);
  });
}

