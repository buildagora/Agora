"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth/AuthProvider";
import type { AppNotification } from "@/lib/notifications";
import Card, { CardContent } from "@/components/ui2/Card";

interface NotificationDisplay {
  id: string;
  primaryText: string;
  secondaryText: string;
  targetHref: string | null;
  isUnread: boolean;
  notification: AppNotification;
}

export default function BuyerNotificationsPage() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<NotificationDisplay[]>([]);

  useEffect(() => {
    const loadNotifications = async () => {
      // NEW FOUNDATION: user comes from useAuth hook (server is source of truth)
      if (!user) {
        setNotifications([]);
        return;
      }
      
      try {
        // Load notifications from API (server queries database)
        const res = await fetch("/api/buyer/notifications", {
          cache: "no-store",
          credentials: "include",
        });
        
        if (!res.ok) {
          setNotifications([]);
          return;
        }
        
        const responseData = await res.json();
        const allNotifications = Array.isArray(responseData) ? responseData : (responseData.data || []);
        
        // Build display models and filter invalid notifications
      const displayNotifications: NotificationDisplay[] = allNotifications
        .map((notification: AppNotification) => {
          // Extract rfqId from data
          const rfqId = notification.data?.rfqId;
          
          // Build primary text based on notification type and data
          let primaryText = "";
          if (notification.type === "BID_RECEIVED") {
            const jobNameOrPo = notification.data?.jobNameOrPo;
            const rfqNumber = notification.data?.rfqNumber;
            const supplierName = notification.data?.supplierName;
            
            if (jobNameOrPo) {
              primaryText = `New bid received for ${jobNameOrPo}`;
            } else if (rfqNumber) {
              primaryText = `New bid received for ${rfqNumber}`;
            } else if (supplierName) {
              primaryText = `New bid received from ${supplierName}`;
            } else {
              primaryText = "New bid received";
            }
          } else if (notification.type === "RFQ_SENT") {
            const title = notification.data?.title;
            primaryText = title ? `RFQ sent: ${title}` : "RFQ sent";
          } else if (notification.type === "MESSAGE_RECEIVED") {
            primaryText = "New message received";
          } else {
            // Fallback: try to use any title/message in data
            primaryText = notification.data?.title || notification.data?.message || "Notification";
          }
          
          // Format date/time
          const date = new Date(notification.createdAt);
          const secondaryText = date.toLocaleString("en-US", {
            year: "numeric",
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
          });
          
          // Build target href
          const targetHref = rfqId ? `/buyer/rfqs/${rfqId}` : null;
          
          return {
            id: notification.id,
            primaryText,
            secondaryText,
            targetHref,
            isUnread: !notification.readAt,
            notification,
          };
        })
        .filter((display: NotificationDisplay) => {
          // Filter out invalid notifications:
          // 1. Must have rfqId (preferred approach - hide notifications without RFQ)
          // 2. Must have meaningful primary text (not empty, not just a date)
          const hasRfqId = display.targetHref !== null;
          const hasValidText = 
            display.primaryText.trim().length > 0 &&
            display.primaryText !== display.secondaryText; // Not just a date
          
          return hasRfqId && hasValidText;
        })
        // Sort by createdAt descending (newest first)
        .sort((a: NotificationDisplay, b: NotificationDisplay) => {
          const dateA = new Date(a.notification.createdAt).getTime();
          const dateB = new Date(b.notification.createdAt).getTime();
          return dateB - dateA;
        });
        
        setNotifications(displayNotifications);
      } catch (error) {
        console.error("Error loading notifications:", error);
        setNotifications([]);
      }
    };

    // Load on mount and when user changes
    if (user) {
      loadNotifications();
    }

    // Note: Removed storage event listeners - data comes from API, not localStorage
    // If real-time updates are needed, use polling or websockets in the future
  }, [user]);

  const handleNotificationClick = async (display: NotificationDisplay) => {
    // NEW FOUNDATION: user comes from useAuth hook (server is source of truth)
    if (!user || !display.targetHref) return;
    
    // Mark as read if unread via API
    if (display.isUnread && display.notification.data?.rfqId) {
      try {
        await fetch("/api/buyer/notifications", {
          method: "PATCH",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            rfqId: display.notification.data.rfqId,
            markRead: true,
          }),
        });
        // Reload notifications after marking as read
        const res = await fetch("/api/buyer/notifications", {
          cache: "no-store",
          credentials: "include",
        });
        if (res.ok) {
          const responseData = await res.json();
          const allNotifications = Array.isArray(responseData) ? responseData : (responseData.data || []);
          // Rebuild display notifications (same logic as loadNotifications)
          const displayNotifications: NotificationDisplay[] = allNotifications
            .map((notification: AppNotification) => {
              const rfqId = notification.data?.rfqId;
              let primaryText = "";
              if (notification.type === "BID_RECEIVED") {
                const jobNameOrPo = notification.data?.jobNameOrPo;
                const rfqNumber = notification.data?.rfqNumber;
                const supplierName = notification.data?.supplierName;
                if (jobNameOrPo) {
                  primaryText = `New bid received for ${jobNameOrPo}`;
                } else if (rfqNumber) {
                  primaryText = `New bid received for ${rfqNumber}`;
                } else if (supplierName) {
                  primaryText = `New bid received from ${supplierName}`;
                } else {
                  primaryText = "New bid received";
                }
              } else if (notification.type === "RFQ_SENT") {
                const title = notification.data?.title;
                primaryText = title ? `RFQ sent: ${title}` : "RFQ sent";
              } else if (notification.type === "MESSAGE_RECEIVED") {
                primaryText = "New message received";
              } else {
                primaryText = notification.data?.title || notification.data?.message || "Notification";
              }
              const date = new Date(notification.createdAt);
              const secondaryText = date.toLocaleString("en-US", {
                year: "numeric",
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              });
              const targetHref = rfqId ? `/buyer/rfqs/${rfqId}` : null;
              return {
                id: notification.id,
                primaryText,
                secondaryText,
                targetHref,
                isUnread: !notification.readAt,
                notification,
              };
            })
            .filter((display: NotificationDisplay) => {
              const hasRfqId = display.targetHref !== null;
              const hasValidText = 
                display.primaryText.trim().length > 0 &&
                display.primaryText !== display.secondaryText;
              return hasRfqId && hasValidText;
            })
            .sort((a: NotificationDisplay, b: NotificationDisplay) => {
              const dateA = new Date(a.notification.createdAt).getTime();
              const dateB = new Date(b.notification.createdAt).getTime();
              return dateB - dateA;
            });
          setNotifications(displayNotifications);
        }
      } catch (error) {
        console.error("Error marking notification as read:", error);
      }
      // Update local state
      setNotifications((prev) =>
        prev.map((n) =>
          n.id === display.id ? { ...n, isUnread: false } : n
        )
      );
    }
  };

  return (
    <div className="flex flex-1 px-6 py-8">
        <div className="w-full max-w-4xl mx-auto">
          <div className="mb-6">
            <h1 className="text-3xl font-semibold text-black dark:text-zinc-50">
              Notifications
            </h1>
          </div>

          {notifications.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-center">
                <p className="text-zinc-600 dark:text-zinc-400">
                  No notifications yet.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="flex flex-col gap-4">
              {notifications.map((display) => {
                // If no target href, render as non-clickable (shouldn't happen after filtering, but defensive)
                if (!display.targetHref) {
                  return (
                    <Card
                      key={display.id}
                      className="border-zinc-200 dark:border-zinc-800 bg-white dark:bg-black opacity-60"
                    >
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className="font-semibold text-black dark:text-zinc-50">
                                {display.primaryText}
                              </h3>
                              {display.isUnread && (
                                <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                              )}
                            </div>
                            <p className="text-xs text-zinc-500 dark:text-zinc-400">
                              {display.secondaryText}
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                }

                // Render as clickable link to RFQ detail page
                return (
                  <Link
                    key={display.id}
                    href={display.targetHref}
                    onClick={() => handleNotificationClick(display)}
                  >
                    <Card
                      className={`cursor-pointer transition-colors ${
                        display.isUnread
                          ? "border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900"
                          : "border-zinc-200 dark:border-zinc-800 bg-white dark:bg-black"
                      }`}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className="font-semibold text-black dark:text-zinc-50">
                                {display.primaryText}
                              </h3>
                              {display.isUnread && (
                                <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                              )}
                            </div>
                            <p className="text-xs text-zinc-500 dark:text-zinc-400">
                              {display.secondaryText}
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>
  );
}
