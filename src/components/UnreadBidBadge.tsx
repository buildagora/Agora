"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth/AuthProvider";
import Badge from "@/components/ui2/Badge";

interface UnreadBidBadgeProps {
  buyerId?: string;
  rfqId: string;
}

/**
 * Client component that displays an unread bid badge
 * NEW FOUNDATION: Loads from API only, no localStorage, no event listeners
 * Fetches BID_RECEIVED notifications from /api/buyer/notifications and filters by rfqId
 */
export default function UnreadBidBadge({ buyerId, rfqId }: UnreadBidBadgeProps) {
  const { user } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    const loadUnreadCount = async () => {
      const userId = buyerId || user?.id;
      
      if (!userId || !rfqId) {
        setUnreadCount(0);
        return;
      }
      
      try {
        // Fetch notifications from API
        const response = await fetch("/api/buyer/notifications", {
          credentials: "include",
          cache: "no-store",
        });

        if (!response.ok) {
          setUnreadCount(0);
          return;
        }

        const result = await response.json();
        
        // Handle both { ok: true, data: [...] } and direct array response
        let notifications: any[] = [];
        if (result && typeof result === "object") {
          if (result.ok && Array.isArray(result.data)) {
            notifications = result.data;
          } else if (Array.isArray(result)) {
            notifications = result;
          }
        }

        // Filter for BID_RECEIVED notifications that are unread and match this RFQ
        const unreadBids = notifications.filter((n: any) => {
          // Must be BID_RECEIVED type
          if (n.type !== "BID_RECEIVED") {
            return false;
          }

          // Must be unread (readAt is null, undefined, or empty)
          if (n.readAt !== null && n.readAt !== undefined && n.readAt !== "") {
            return false;
          }

          // Must match this RFQ ID (check both direct rfqId and nested data.rfqId)
          const notificationRfqId = n.rfqId || (n.data && n.data.rfqId);
          if (notificationRfqId !== rfqId) {
            return false;
          }

          return true;
        });

        setUnreadCount(unreadBids.length);
      } catch (error) {
        console.error("Error loading unread bid count:", error);
        setUnreadCount(0);
      }
    };

    // Load on mount
    loadUnreadCount();

    // Poll every 15 seconds to keep UI updated
    const intervalId = setInterval(loadUnreadCount, 15000);

    // Cleanup interval on unmount
    return () => {
      clearInterval(intervalId);
    };
  }, [buyerId, rfqId, user]);

  if (unreadCount === 0) {
    return null;
  }

  return (
    <Badge variant="info">
      {unreadCount === 1 ? "New bid" : `New bids (${unreadCount})`}
    </Badge>
  );
}

