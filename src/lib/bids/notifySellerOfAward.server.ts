/**
 * Server-side function to notify seller when their bid is awarded
 * Creates in-app notification and sends email
 */

import "server-only";
import { getPrisma } from "@/lib/db.server";
import { sendBidAwardedEmail, sendPoGeneratedEmail } from "@/lib/notifications/resend.server";

export interface NotifySellerOfAwardParams {
  rfqId: string;
  rfqNumber: string;
  rfqTitle: string;
  bidId: string;
  orderId: string;
  sellerId: string;
  sellerEmail: string;
  sellerName: string;
  buyerName?: string;
  bidTotal: number;
}

export interface NotifySellerResult {
  attempted: number;
  sent: number;
  errors: number;
}

/**
 * Notify seller about award
 * Creates in-app notification and sends email
 */
export async function notifySellerOfAward(
  params: NotifySellerOfAwardParams
): Promise<NotifySellerResult> {
  const prisma = getPrisma();
  let attempted = 0;
  let sent = 0;
  let errors = 0;

  try {
    // Create in-app notifications (BID_AWARDED + PO_GENERATED)
    try {
      const { createNotification } = await import("@/lib/notifications/createNotification.server");
      
      // Notification 1: Bid Awarded
      await createNotification({
        userId: params.sellerId,
        type: "BID_AWARDED",
        rfqId: params.rfqId,
        bidId: params.bidId,
        data: {
          rfqNumber: params.rfqNumber,
          bidTotal: params.bidTotal,
        },
      });

      // Notification 2: PO Generated
      await createNotification({
        userId: params.sellerId,
        type: "PO_GENERATED",
        rfqId: params.rfqId,
        orderId: params.orderId,
        data: {
          rfqNumber: params.rfqNumber,
          orderId: params.orderId,
          bidTotal: params.bidTotal,
        },
      });
    } catch (notifError) {
      console.error("[NOTIFY_SELLER_AWARD_NOTIFICATION_CREATE_FAILED]", {
        sellerId: params.sellerId,
        rfqId: params.rfqId,
        bidId: params.bidId,
        error: notifError instanceof Error ? notifError.message : String(notifError),
      });
    }

    // Send email notifications (BID_AWARDED + PO_GENERATED)
    attempted = 2; // Two emails: award + PO

    if (!params.sellerEmail) {
      console.log("[NOTIFY_SELLER_AWARD_NO_EMAIL]", {
        sellerId: params.sellerId,
        rfqId: params.rfqId,
        bidId: params.bidId,
        reason: "Seller has no email address",
      });
      return { attempted, sent: 0, errors: 0 };
    }

    // Email 1: Bid Awarded
    try {
      await sendBidAwardedEmail({
        to: params.sellerEmail,
        sellerName: params.sellerName,
        rfqNumber: params.rfqNumber,
        rfqTitle: params.rfqTitle,
        buyerName: params.buyerName || "Buyer",
        bidTotal: params.bidTotal,
        link: `/seller/rfqs/${params.rfqId}`,
      });
      sent++;
    } catch (emailError) {
      errors++;
      console.error("[NOTIFY_SELLER_AWARD_EMAIL_FAILED]", {
        sellerId: params.sellerId,
        sellerEmail: params.sellerEmail,
        rfqId: params.rfqId,
        bidId: params.bidId,
        emailType: "BID_AWARDED",
        error: emailError instanceof Error ? emailError.message : String(emailError),
      });
    }

    // Email 2: PO Generated
    try {
      await sendPoGeneratedEmail({
        to: params.sellerEmail,
        sellerName: params.sellerName,
        orderNumber: params.orderId,
        rfqNumber: params.rfqNumber,
        rfqTitle: params.rfqTitle,
        buyerName: params.buyerName || "Buyer",
        orderTotal: params.bidTotal,
        link: `/seller/rfqs/${params.rfqId}`,
      });
      sent++;
    } catch (emailError) {
      errors++;
      console.error("[NOTIFY_SELLER_PO_EMAIL_FAILED]", {
        sellerId: params.sellerId,
        sellerEmail: params.sellerEmail,
        rfqId: params.rfqId,
        orderId: params.orderId,
        emailType: "PO_GENERATED",
        error: emailError instanceof Error ? emailError.message : String(emailError),
      });
    }

    return { attempted, sent, errors };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("[NOTIFY_SELLER_AWARD_ERROR]", {
      rfqId: params.rfqId,
      bidId: params.bidId,
      error: errorMessage,
    });
    return { attempted, sent, errors: errors + 1 };
  }
}
