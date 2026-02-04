"use client";

import { useEffect } from "react";
import { useAuth } from "@/lib/auth/AuthProvider";

interface MarkNotificationsReadProps {
  buyerId?: string;
  rfqId: string;
}

/**
 * Client component that marks bid notifications as read when mounted
 * NEW FOUNDATION: Uses API only, no localStorage
 */
export default function MarkNotificationsRead({ buyerId, rfqId }: MarkNotificationsReadProps) {
  const { user } = useAuth();
  
  useEffect(() => {
    const userId = buyerId || user?.id;
    
    if (!userId || !rfqId) {
      return;
    }
    
    // NEW FOUNDATION: Mark as read via API
    const markAsRead = async () => {
      try {
        const res = await fetch("/api/buyer/notifications", {
          method: "PATCH",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            rfqId,
            markRead: true,
          }),
        });
        
        if (!res.ok) {
          // API not available yet - silently fail
          if (process.env.NODE_ENV === "development") {
            console.warn("Could not mark notifications as read - API not available");
          }
        }
      } catch (error) {
        // Network error - silently fail
        if (process.env.NODE_ENV === "development") {
          console.error("Error marking notifications as read:", error);
        }
      }
    };

    markAsRead();
  }, [buyerId, rfqId, user]);

  return null; // This component doesn't render anything
}


