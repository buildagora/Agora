/**
 * Server-side function to notify buyer when a new bid is submitted
 * Creates in-app notification and sends email
 */

import "server-only";
import { getPrisma } from "@/lib/db.server";
import { sendBidSubmittedEmail } from "@/lib/notifications/resend.server";

export interface NotifyBuyerOfNewBidParams {
  bidId: string;
  rfqId: string;
  rfqNumber: string;
  rfqTitle: string;
  buyerId: string;
  buyerEmail: string;
  buyerName?: string;
  sellerId: string;
  sellerName: string;
  bidTotal: number;
}

export interface NotifyBuyerResult {
  attempted: number;
  sent: number;
  errors: number;
}

/**
 * Notify buyer about a new bid submission
 * Creates in-app notification and sends email
 */
export async function notifyBuyerOfNewBid(
  params: NotifyBuyerOfNewBidParams
): Promise<NotifyBuyerResult> {
  const prisma = getPrisma();
  let attempted = 0;
  let sent = 0;
  let errors = 0;

  try {
    // Verify buyer exists
    const buyer = await prisma.user.findUnique({
      where: { id: params.buyerId },
      select: { id: true, email: true, fullName: true, companyName: true },
    });

    if (!buyer) {
      console.error("[NOTIFY_BUYER_BID_BUYER_NOT_FOUND]", {
        buyerId: params.buyerId,
        rfqId: params.rfqId,
        bidId: params.bidId,
      });
      return { attempted: 0, sent: 0, errors: 1 };
    }

    // Create in-app notification
    try {
      const { createNotification } = await import("@/lib/notifications/createNotification.server");
      await createNotification({
        userId: params.buyerId,
        type: "BID_RECEIVED",
        rfqId: params.rfqId,
        bidId: params.bidId,
        data: {
          rfqNumber: params.rfqNumber,
          sellerId: params.sellerId,
          sellerName: params.sellerName,
          bidTotal: params.bidTotal,
        },
      });
    } catch (notifError) {
      console.error("[NOTIFY_BUYER_BID_NOTIFICATION_CREATE_FAILED]", {
        buyerId: params.buyerId,
        rfqId: params.rfqId,
        bidId: params.bidId,
        error: notifError instanceof Error ? notifError.message : String(notifError),
      });
      // Continue to email even if notification creation fails
    }

    // Send email notification
    attempted = 1;

    if (!buyer.email) {
      console.log("[NOTIFY_BUYER_BID_NO_EMAIL]", {
        buyerId: params.buyerId,
        rfqId: params.rfqId,
        bidId: params.bidId,
        reason: "Buyer has no email address",
      });
      return { attempted, sent: 0, errors: 0 };
    }

    try {
      await sendBidSubmittedEmail({
        to: buyer.email,
        buyerName: buyer.fullName || buyer.companyName || "Buyer",
        rfqNumber: params.rfqNumber,
        rfqTitle: params.rfqTitle,
        sellerName: params.sellerName,
        bidTotal: params.bidTotal,
        link: `/buyer/bids/${params.bidId}`,
      });

      sent = 1;
    } catch (emailError) {
      errors = 1;
      console.error("[NOTIFY_BUYER_BID_EMAIL_FAILED]", {
        buyerId: params.buyerId,
        buyerEmail: buyer.email,
        rfqId: params.rfqId,
        bidId: params.bidId,
        error: emailError instanceof Error ? emailError.message : String(emailError),
      });
    }

    return { attempted, sent, errors };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("[NOTIFY_BUYER_BID_ERROR]", {
      rfqId: params.rfqId,
      bidId: params.bidId,
      error: errorMessage,
    });
    return { attempted, sent, errors: errors + 1 };
  }
}
