"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  listNotificationsForRole,
  markRead,
  type Notification,
} from "@/lib/notifications";
import Header from "@/components/Header";

export default function SellerNotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  useEffect(() => {
    const loadNotifications = () => {
      const sellerNotifications = listNotificationsForRole("SELLER");
      setNotifications(sellerNotifications);
    };

    // Load on mount
    loadNotifications();

    // Removed window event listeners - refresh only via API fetch
  }, []);

  const handleNotificationClick = (notification: Notification) => {
    if (!notification.isRead) {
      markRead(notification.id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === notification.id ? { ...n, isRead: true } : n))
      );
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  return (
    <div className="flex min-h-screen flex-col bg-white dark:bg-black">
      <Header />

      {/* Main content */}
      <main className="flex flex-1 px-6 py-8 max-w-4xl mx-auto w-full">
        <div className="w-full">
          <div className="mb-6">
            <h1 className="text-3xl font-semibold text-black dark:text-zinc-50">
              Notifications
            </h1>
          </div>

          {notifications.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-zinc-600 dark:text-zinc-400">
                No notifications yet.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {notifications.map((notification) => (
                <div
                  key={notification.id}
                  onClick={() => handleNotificationClick(notification)}
                  className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                    notification.isRead
                      ? "border-zinc-200 dark:border-zinc-800 bg-white dark:bg-black"
                      : "border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900"
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold text-black dark:text-zinc-50">
                          {notification.title}
                        </h3>
                        {!notification.isRead && (
                          <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                        )}
                      </div>
                      {notification.body && (
                        <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-2">
                          {notification.body}
                        </p>
                      )}
                      <p className="text-xs text-zinc-500 dark:text-zinc-500">
                        {formatDate(notification.createdAt)}
                      </p>
                      {notification.ctaLabel && notification.ctaHref && (
                        <Link
                          href={notification.ctaHref}
                          onClick={(e) => e.stopPropagation()}
                          className="mt-2 inline-block text-sm text-blue-600 dark:text-blue-400 hover:underline"
                        >
                          {notification.ctaLabel} →
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

