/**
 * Server-side function to notify buyer when award is made
 * Creates in-app notification and sends email
 */

import "server-only";
import { getPrisma } from "@/lib/db.server";
import { sendAwardConfirmationEmail } from "@/lib/notifications/resend.server";

export interface NotifyBuyerOfAwardParams {
  rfqId: string;
  rfqNumber: string;
  rfqTitle: string;
  orderId: string;
  buyerId: string;
  buyerEmail: string;
  buyerName?: string;
  sellerName: string;
  bidTotal: number;
}

export interface NotifyBuyerResult {
  attempted: number;
  sent: number;
  errors: number;
}

/**
 * Notify buyer about award confirmation
 * Creates in-app notification and sends email
 */
export async function notifyBuyerOfAward(
  params: NotifyBuyerOfAwardParams
): Promise<NotifyBuyerResult> {
  const prisma = getPrisma();
  let attempted = 0;
  let sent = 0;
  let errors = 0;

  try {
    // Create in-app notification
    try {
      const { createNotification } = await import("@/lib/notifications/createNotification.server");
      await createNotification({
        userId: params.buyerId,
        type: "AWARD_CONFIRMED",
        rfqId: params.rfqId,
        data: {
          rfqNumber: params.rfqNumber,
          sellerName: params.sellerName,
          bidTotal: params.bidTotal,
          orderId: params.orderId,
        },
      });
    } catch (notifError) {
      console.error("[NOTIFY_BUYER_AWARD_NOTIFICATION_CREATE_FAILED]", {
        buyerId: params.buyerId,
        rfqId: params.rfqId,
        error: notifError instanceof Error ? notifError.message : String(notifError),
      });
    }

    // Send email notification
    attempted = 1;

    if (!params.buyerEmail) {
      console.log("[NOTIFY_BUYER_AWARD_NO_EMAIL]", {
        buyerId: params.buyerId,
        rfqId: params.rfqId,
        reason: "Buyer has no email address",
      });
      return { attempted, sent: 0, errors: 0 };
    }

    try {
      await sendAwardConfirmationEmail({
        to: params.buyerEmail,
        buyerName: params.buyerName || "Buyer",
        rfqNumber: params.rfqNumber,
        rfqTitle: params.rfqTitle,
        sellerName: params.sellerName,
        bidTotal: params.bidTotal,
        orderId: params.orderId,
        link: `/buyer/rfqs/${params.rfqId}`,
      });

      sent = 1;
    } catch (emailError) {
      errors = 1;
      console.error("[NOTIFY_BUYER_AWARD_EMAIL_FAILED]", {
        buyerId: params.buyerId,
        buyerEmail: params.buyerEmail,
        rfqId: params.rfqId,
        error: emailError instanceof Error ? emailError.message : String(emailError),
      });
    }

    return { attempted, sent, errors };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("[NOTIFY_BUYER_AWARD_ERROR]", {
      rfqId: params.rfqId,
      error: errorMessage,
    });
    return { attempted, sent, errors: errors + 1 };
  }
}
