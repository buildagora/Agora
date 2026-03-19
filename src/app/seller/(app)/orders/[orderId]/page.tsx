import { redirect } from "next/navigation";
import { getPrisma } from "@/lib/db.rsc";
import { verifyAuthToken, getAuthCookieName } from "@/lib/jwt";
import { cookies } from "next/headers";
import AppShell from "@/components/ui2/AppShell";
import Card, { CardContent } from "@/components/ui2/Card";
import Badge from "@/components/ui2/Badge";
import Link from "next/link";
import PurchaseOrderActions from "@/components/PurchaseOrderActions";

/**
 * Seller Order Detail Page
 * Displays order information for a seller
 */
export default async function SellerOrderPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;

  // Auth check
  const cookieStore = await cookies();
  const cookieName = getAuthCookieName();
  const token = cookieStore.get(cookieName)?.value;

  if (!token) {
    redirect("/seller/login");
  }

  const payload = await verifyAuthToken(token);
  if (!payload) {
    redirect("/seller/login");
  }

  // Load user and verify seller role
  const prisma = getPrisma();
  const dbUser = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { id: true, role: true },
  });

  if (!dbUser || dbUser.role !== "SELLER") {
    redirect("/auth/switch-role?target=SELLER");
  }

  // Load order - use findUnique with simple include
  const dbOrder = await prisma.order.findUnique({
    where: { id: orderId },
    include: { buyer: true },
  });

  if (!dbOrder) {
    return (
      <AppShell role="seller" active="orders">
        <div className="p-6">
          <Card>
            <CardContent className="p-6">
              <h1 className="text-2xl font-semibold mb-4">Order Not Found</h1>
              <p className="text-zinc-600">
                The order you're looking for doesn't exist or you don't have access to it.
              </p>
              <Link
                href="/seller/feed"
                className="mt-4 inline-block text-blue-600 hover:text-blue-700"
              >
                ← Back to Feed
              </Link>
            </CardContent>
          </Card>
        </div>
      </AppShell>
    );
  }

  // Check if order has a bidId - if not, seller cannot access it
  // Redirect to switch-role to preserve session and allow role switch
  if (!dbOrder.bidId) {
    redirect(
      `/auth/switch-role?target=SELLER&returnTo=${encodeURIComponent(`/seller/orders/${orderId}`)}`
    );
  }

  // Verify seller owns the bid for this order
  const bid = await prisma.bid.findUnique({
    where: { id: dbOrder.bidId },
    select: { id: true, sellerId: true, rfqId: true, total: true },
  });

  if (!bid) {
    return (
      <AppShell role="seller" active="orders">
        <div className="p-6">
          <Card>
            <CardContent className="p-6">
              <h1 className="text-2xl font-semibold mb-4">Order Not Found</h1>
              <p className="text-zinc-600">
                The order you're looking for doesn't exist or you don't have access to it.
              </p>
              <Link
                href="/seller/feed"
                className="mt-4 inline-block text-blue-600 hover:text-blue-700"
              >
                ← Back to Feed
              </Link>
            </CardContent>
          </Card>
        </div>
      </AppShell>
    );
  }

  if (bid.sellerId !== dbUser.id) {
    // Seller doesn't own this bid - redirect to switch role with returnTo preserved
    redirect(
      `/auth/switch-role?target=SELLER&returnTo=${encodeURIComponent(`/seller/orders/${orderId}`)}`
    );
  }

  // Fetch RFQ separately - use bid.rfqId or fallback to dbOrder.rfqId
  const rfqId = bid.rfqId || dbOrder.rfqId;
  const rfq = rfqId
    ? await prisma.rFQ.findUnique({
        where: { id: rfqId },
        select: { id: true, rfqNumber: true, title: true },
      })
    : null;
  
  // RFQ is optional - render order even if RFQ is missing (defensive handling)

  // Parse JSON fields
  const lineItems = dbOrder.lineItems ? JSON.parse(dbOrder.lineItems) : [];
  const status = dbOrder.status;

  return (
    <AppShell role="seller" active="orders">
      <div className="p-6 max-w-4xl">
        <div className="mb-6">
          <Link
            href="/seller/feed"
            className="text-blue-600 hover:text-blue-700 text-sm"
          >
            ← Back to Feed
          </Link>
        </div>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h1 className="text-3xl font-semibold text-black">
                  Order {orderId.substring(0, 8)}
                </h1>
                {rfq && (
                  <p className="text-sm text-zinc-600 mt-1">
                    RFQ: {rfq.rfqNumber} - {rfq.title}
                  </p>
                )}
              </div>
              <Badge
                variant={
                  status === "delivered" || status === "picked_up"
                    ? "success"
                    : status === "confirmed" || status === "scheduled"
                    ? "info"
                    : status === "cancelled"
                    ? "error"
                    : "default"
                }
              >
                {status.charAt(0).toUpperCase() + status.slice(1)}
              </Badge>
            </div>

            <div className="space-y-6">
              {/* Order Details */}
              <div>
                <h2 className="text-lg font-semibold mb-3">Order Details</h2>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-zinc-600">Order ID:</span>
                    <span className="ml-2 font-mono">{orderId}</span>
                  </div>
                  <div>
                    <span className="text-zinc-600">Status:</span>
                    <span className="ml-2">{status}</span>
                  </div>
                  <div>
                    <span className="text-zinc-600">Subtotal:</span>
                    <span className="ml-2">${dbOrder.subtotal.toFixed(2)}</span>
                  </div>
                  <div>
                    <span className="text-zinc-600">Taxes:</span>
                    <span className="ml-2">${(dbOrder.taxes || 0).toFixed(2)}</span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-zinc-600">Total:</span>
                    <span className="ml-2 font-semibold text-lg">
                      ${dbOrder.total.toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Line Items */}
              {lineItems.length > 0 && (
                <div>
                  <h2 className="text-lg font-semibold mb-3">Line Items</h2>
                  <div className="border border-zinc-200 rounded-lg overflow-hidden">
                    <table className="w-full">
                      <thead className="bg-zinc-50">
                        <tr>
                          <th className="px-4 py-2 text-left text-sm font-semibold">Description</th>
                          <th className="px-4 py-2 text-right text-sm font-semibold">Quantity</th>
                          <th className="px-4 py-2 text-right text-sm font-semibold">Unit</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lineItems.map((item: any, idx: number) => (
                          <tr
                            key={idx}
                            className="border-t border-zinc-200"
                          >
                            <td className="px-4 py-2">{item.description || "-"}</td>
                            <td className="px-4 py-2 text-right">{item.quantity || "-"}</td>
                            <td className="px-4 py-2 text-right">{item.unit || "-"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Fulfillment Details */}
              {dbOrder.fulfillmentType && (
                <div>
                  <h2 className="text-lg font-semibold mb-3">Fulfillment</h2>
                  <div className="text-sm space-y-1">
                    <div>
                      <span className="text-zinc-600">Type:</span>
                      <span className="ml-2 capitalize">{dbOrder.fulfillmentType}</span>
                    </div>
                    {dbOrder.requestedDate && (
                      <div>
                        <span className="text-zinc-600">Requested Date:</span>
                        <span className="ml-2">
                          {new Date(dbOrder.requestedDate).toLocaleDateString()}
                        </span>
                      </div>
                    )}
                    {dbOrder.location && (
                      <div>
                        <span className="text-zinc-600">Location:</span>
                        <span className="ml-2">{dbOrder.location}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Link to RFQ */}
              {rfq && (
                <div>
                  <Link
                    href={`/seller/rfqs/${rfq.id}`}
                    className="text-blue-600 hover:text-blue-700 text-sm"
                  >
                    View RFQ →
                  </Link>
                </div>
              )}

              {/* Purchase Order Actions */}
              {rfq && (
                <PurchaseOrderActions
                  rfqId={rfq.id}
                  role="SELLER"
                />
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}

