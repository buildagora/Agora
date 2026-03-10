"use client";

// Removed scopedStorage import - notifications are now stored in database via API

/**
 * Canonical in-app notification system
 * Storage key: agora.data.${userId}.notifications
 * Single source of truth for all notifications
 */

export type NotificationType = "BID_RECEIVED" | "RFQ_SENT" | "MESSAGE_RECEIVED" | string;

export type AppNotification = {
  id: string;
  userId: string;
  type: NotificationType;
  createdAt: string;
  readAt?: string | null;
  data?: Record<string, any>;
};

/**
 * Build a stable deterministic notification ID
 * Used for idempotency and deduplication
 */
export function buildRfqNotificationId(rfqId: string, type: string, supplierId?: string): string {
  return `rfq:${rfqId}:${type}:${supplierId ?? "na"}`;
}

/**
 * Get all notifications for a user
 */
export function getNotifications(userId: string): AppNotification[] {
  // Removed readUserJson - notifications are now stored in database via API
  // This function is kept for backwards compatibility but returns empty array
  return [];
}

/**
 * Save notifications for a user
 */
export function saveNotifications(userId: string, notifications: AppNotification[]): void {
  // Removed writeUserJson - notifications are now stored in database via API
  // This function is kept for backwards compatibility but is a no-op
  // Notifications should be saved via PATCH /api/*/notifications
}

/**
 * Add a notification for a user (with deduplication by id)
 */
export function pushNotification(
  userId: string,
  n: Omit<AppNotification, "userId"> & { userId?: string }
): void {
  // HARDENED: Never throw, always log warnings for missing userId
  if (typeof window === "undefined") {
    if (process.env.NODE_ENV === "development") {
      console.warn("⚠️ pushNotification: window is undefined (server-side)");
    }
    return;
  }
  
  if (!userId || typeof userId !== "string" || userId.trim().length === 0) {
    console.warn("⚠️ pushNotification: userId is missing or invalid", {
      userId,
      notificationId: n.id,
    });
    return;
  }
  
  try {
    const notifications = getNotifications(userId);
    
    // Ensure userId is set
    const notification: AppNotification = {
      ...n,
      userId: n.userId || userId,
    };
    
    // Deduplicate by id (replace existing if found)
    const existingIndex = notifications.findIndex((notif) => notif.id === notification.id);
    if (existingIndex >= 0) {
      notifications[existingIndex] = notification;
    } else {
      notifications.unshift(notification);
    }
    
    saveNotifications(userId, notifications);
    
    if (process.env.NODE_ENV === "development") {
      console.log("🔔 NOTIFICATION_PUSHED", {
        userId,
        notificationId: notification.id,
        type: notification.type,
        rfqId: notification.data?.rfqId,
      });
    }
  } catch (error) {
    // Never throw - log and continue
    console.warn("⚠️ Error pushing notification", {
      userId,
      error: error instanceof Error ? error.message : String(error),
      notificationId: n.id,
    });
  }
}

/**
 * Alias for backward compatibility
 */
export const addNotification = pushNotification;

/**
 * Mark all bid notifications for a specific RFQ as read
 */
export function markNotificationsReadByRfq(userId: string, rfqId: string): void {
  if (typeof window === "undefined" || !userId || !rfqId) {
    return;
  }
  
  try {
    const notifications = getNotifications(userId);
    const now = new Date().toISOString();
    const updated = notifications.map((n) => {
      // Mark as read if it's a BID_RECEIVED notification for this RFQ and not already read
      if (
        n.type === "BID_RECEIVED" &&
        n.data?.rfqId === rfqId &&
        !n.readAt
      ) {
        return { ...n, readAt: now };
      }
      return n;
    });
    
    saveNotifications(userId, updated);
    
    if (process.env.NODE_ENV === "development") {
      const markedCount = updated.filter(
        (n) => n.type === "BID_RECEIVED" && n.data?.rfqId === rfqId && n.readAt === now
      ).length;
      console.log("✅ MARKED_NOTIFICATIONS_READ_BY_RFQ", {
        userId,
        rfqId,
        markedCount,
      });
    }
  } catch (error) {
    console.error(`Error marking notifications as read for RFQ ${rfqId}:`, error);
  }
}

/**
 * Get unread bid count for a specific RFQ
 */
export function getUnreadBidCountByRfq(userId: string, rfqId: string): number {
  if (!userId || !rfqId) {
    return 0;
  }
  
  try {
    const notifications = getNotifications(userId);
    return notifications.filter(
      (n) =>
        n.type === "BID_RECEIVED" &&
        n.data?.rfqId === rfqId &&
        !n.readAt
    ).length;
  } catch (error) {
    console.error(`Error getting unread bid count for RFQ ${rfqId}:`, error);
    return 0;
  }
}

/**
 * Legacy global notification system (for backward compatibility)
 * Storage key: agora:notifications:v1
 */

export type UserRole = "BUYER" | "SELLER";

export interface Notification {
  id: string;
  createdAt: string;
  toUserId?: string;
  toRole?: UserRole;
  title: string;
  body?: string;
  ctaLabel?: string;
  ctaHref?: string;
  isRead?: boolean;
}

// Removed NOTIFICATIONS_STORAGE_KEY and legacy localStorage functions
// Notifications are now stored in database via API

/**
 * Legacy pushNotification for backward compatibility
 * This is for the old global notification system
 * NOTE: Legacy notifications are no longer stored - this is a no-op
 */
export function pushLegacyNotification(notification: Notification): void {
  // Removed legacy storage - notifications are now stored in database via API
  // This function is kept for backwards compatibility but is a no-op
  if (process.env.NODE_ENV === "development") {
    console.warn("⚠️ pushLegacyNotification: Legacy notification storage removed, use canonical API instead");
  }
}

export function listNotificationsForRole(role: UserRole): Notification[] {
  // Removed legacy storage - notifications are now stored in database via API
  // This function is kept for backwards compatibility but returns empty array
  return [];
}

export function markRead(notificationId: string): void {
  // Removed localStorage-based read marking
  // Notifications are now marked as read via API (PATCH /api/*/notifications)
  // This function is kept for backwards compatibility but is a no-op
}

/**
 * Notify suppliers of a new RFQ via email
 * NOTE: Email notifications are now sent server-side automatically when RFQ is created.
 * This function is kept for backwards compatibility but no longer sends emails.
 */
export async function notifySuppliersOfNewRfq(
  rfq: {
    id: string;
    buyerName: string;
    category: string;
    title: string;
    description?: string;
    createdAt: string;
    dueAt?: string;
    location?: string;
    urlPath?: string;
  }
): Promise<{ attempted: number; sent: number; skipped: number; errors: number }> {
  if (typeof window === "undefined") {
    return { attempted: 0, sent: 0, skipped: 0, errors: 0 };
  }

  // TODO: Replace with API call to /api/suppliers when supplier API exists
  // For now, return empty result (no suppliers available)
  const matchingSuppliers: any[] = [];
  
  // Removed storage dependency - supplier management will be API-backed
  /*
  // Filter suppliers by category
  const matchingSuppliers = suppliers.filter((supplier) => {
    // Check both legacy categories and categoryIds
    const hasCategory =
      (supplier.categories && supplier.categories.includes(rfq.category)) ||
      (supplier.categoryIds && supplier.categoryIds.includes(rfq.category.toLowerCase()));
    
    // Only include active suppliers with email
    return (
      hasCategory &&
      supplier.email &&
      supplier.isActive !== false &&
      !supplier.unsubscribed
    );
  });
  */

  // Return empty result until supplier API exists
  return { attempted: 0, sent: 0, skipped: 0, errors: 0 };
  
  /* Removed storage-based supplier notification - will be replaced with API
  let attempted = 0;
  let sent = 0;
  let skipped = 0;
  let errors = 0;

  // Notify each matching supplier
  for (const supplier of matchingSuppliers) {
    if (!supplier.email) {
      skipped++;
      continue;
    }

    attempted++;
    const notificationId = buildRfqNotificationId(rfq.id, "RFQ_SENT", supplier.id);

    try {
      const response = await fetch("/api/notifications/rfq-created", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": notificationId,
        },
        body: JSON.stringify({
          rfq: {
            id: rfq.id,
            buyerName: rfq.buyerName,
            category: rfq.category,
            title: rfq.title,
            description: rfq.description,
            createdAt: rfq.createdAt,
            dueAt: rfq.dueAt,
            location: rfq.location,
            urlPath: rfq.urlPath || `/seller/feed?category=${encodeURIComponent(rfq.category)}`,
          },
          supplier: {
            id: supplier.id,
            email: supplier.email,
            name: supplier.name,
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const result = await response.json();
      if (result.ok) {
        sent++;
      } else {
        errors++;
      }
    } catch (error) {
      errors++;
      if (process.env.NODE_ENV === "development") {
        console.error(`Failed to notify supplier ${supplier.id}:`, error);
      }
    }
  }

  return { attempted, sent, skipped, errors };
  */
}