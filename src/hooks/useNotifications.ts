"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "@/lib/auth/AuthProvider";
import type { AppNotification } from "@/lib/notifications";

export interface UseNotificationsReturn {
  notifications: AppNotification[];
  unreadCount: number;
  unreadBidRfqIds: Set<string>;
  unreadBidCountByRfq: (rfqId: string) => number;
}

/**
 * Hook for notification state
 * NEW FOUNDATION: Loads from API only, no localStorage, no event listeners
 */
export function useNotifications(): UseNotificationsReturn {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const loadNotifications = useCallback(async () => {
    if (!user) {
      setNotifications([]);
      setUnreadCount(0);
      return;
    }

    try {
      // NEW FOUNDATION: Load from API (server is source of truth)
      const res = await fetch("/api/buyer/notifications", {
        cache: "no-store",
        credentials: "include",
      });
      
      if (res.ok) {
        const data = await res.json();
        const apiNotifications = Array.isArray(data) ? data : (data.data || []);
        const unread = apiNotifications.filter((n: AppNotification) => !n.readAt).length;
        
        setNotifications(apiNotifications);
        setUnreadCount(unread);
      } else {
        // API not available yet - return empty state
        setNotifications([]);
        setUnreadCount(0);
      }
    } catch (error) {
      console.error("Error loading notifications:", error);
      setNotifications([]);
      setUnreadCount(0);
    }
  }, [user]);

  useEffect(() => {
    // Load on mount and when user changes
    loadNotifications();
    
    // Removed all window event listeners - refresh only via API fetch
    // No storage listeners, no agora:notifications events
  }, [loadNotifications]);

  // Get RFQ IDs with unread bids
  const unreadBidRfqIds = useMemo(() => {
    if (!user) return new Set<string>();
    const rfqIds = new Set<string>();
    notifications.forEach((n) => {
      if (n.type === "BID_RECEIVED" && !n.readAt && n.data?.rfqId) {
        rfqIds.add(n.data.rfqId);
      }
    });
    return rfqIds;
  }, [notifications, user]);
  
  const unreadBidCountByRfq = useCallback(
    (rfqId: string) => {
      if (!user) return 0;
      // Count from API-loaded notifications only
      return notifications.filter(
        (n) => n.type === "BID_RECEIVED" && !n.readAt && n.data?.rfqId === rfqId
      ).length;
    },
    [user, notifications]
  );

  return {
    notifications,
    unreadCount,
    unreadBidRfqIds,
    unreadBidCountByRfq,
  };
}

