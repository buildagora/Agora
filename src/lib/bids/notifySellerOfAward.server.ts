/**
 * Server-side function to notify seller when their bid is awarded
 * Creates in-app notification and sends email
 */

import "server-only";
import { getPrisma } from "@/lib/db.server";
import { sendBidAwardedEmail, sendPoGeneratedEmail } from "@/lib/notifications/resend.server";

/**
 * Regression guard: Ensures seller email links never point to buyer routes.
 * This prevents cross-discipline contamination where buyers clicking seller links
 * get redirected to buyer dashboard.
 * 
 * @param link The link to validate
 * @returns The validated link
 * @throws Error if link doesn't start with /seller/
 */
function assertSellerLink(link: string): string {
  if (!link.startsWith("/seller/")) {
    throw new Error(
      `Seller email link must start with /seller/ but got: ${link}. ` +
      "This prevents cross-discipline contamination (buyer clicking seller link)."
    );
  }
  return link;
}

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

    // Find supplier org from sellerId (via SupplierMember)
    // Then get ALL ACTIVE SupplierMember users for that org
    const sellerMembership = await prisma.supplierMember.findFirst({
      where: {
        userId: params.sellerId,
        status: "ACTIVE",
      },
      select: { supplierId: true },
    });

    let recipientEmails: string[] = [];

    if (sellerMembership) {
      // Find all ACTIVE members for this supplier org
      const activeMembers = await prisma.supplierMember.findMany({
        where: {
          supplierId: sellerMembership.supplierId,
          status: "ACTIVE",
        },
        include: {
          user: {
            select: { email: true },
          },
        },
      });

      // Collect emails from active members
      recipientEmails = activeMembers
        .map((member) => member.user.email)
        .filter((email): email is string => Boolean(email));
    }

    // Fallback to single sellerEmail if no org members found (legacy behavior)
    if (recipientEmails.length === 0 && params.sellerEmail) {
      recipientEmails = [params.sellerEmail];
    }

    if (recipientEmails.length === 0) {
      console.log("[NOTIFY_SELLER_AWARD_NO_EMAIL]", {
        sellerId: params.sellerId,
        rfqId: params.rfqId,
        bidId: params.bidId,
        reason: "No active supplier members with email addresses",
      });
      return { attempted: 0, sent: 0, errors: 0 };
    }

    // Send email notifications (BID_AWARDED + PO_GENERATED) to all recipients
    attempted = recipientEmails.length * 2; // Two emails per recipient: award + PO

    const bidLink = `/seller/rfqs/${params.rfqId}`;
    const orderLink = `/seller/orders/${params.orderId}?from=email`;
    assertSellerLink(bidLink);
    assertSellerLink(orderLink);

    // Email all recipients
    for (const recipientEmail of recipientEmails) {
      // Email 1: Bid Awarded
      try {
        await sendBidAwardedEmail({
          to: recipientEmail,
          sellerName: params.sellerName,
          rfqNumber: params.rfqNumber,
          rfqTitle: params.rfqTitle,
          buyerName: params.buyerName || "Buyer",
          bidTotal: params.bidTotal,
          link: bidLink,
        });
        sent++;
      } catch (emailError) {
        errors++;
        console.error("[NOTIFY_SELLER_AWARD_EMAIL_FAILED]", {
          sellerId: params.sellerId,
          recipientEmail,
          rfqId: params.rfqId,
          bidId: params.bidId,
          emailType: "BID_AWARDED",
          error: emailError instanceof Error ? emailError.message : String(emailError),
        });
      }

      // Email 2: PO Generated
      try {
        await sendPoGeneratedEmail({
          to: recipientEmail,
          sellerName: params.sellerName,
          orderNumber: params.orderId,
          rfqNumber: params.rfqNumber,
          rfqTitle: params.rfqTitle,
          buyerName: params.buyerName || "Buyer",
          orderTotal: params.bidTotal,
          link: orderLink,
        });
        sent++;
      } catch (emailError) {
        errors++;
        console.error("[NOTIFY_SELLER_PO_EMAIL_FAILED]", {
          sellerId: params.sellerId,
          recipientEmail,
          rfqId: params.rfqId,
          orderId: params.orderId,
          emailType: "PO_GENERATED",
          error: emailError instanceof Error ? emailError.message : String(emailError),
        });
      }
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
