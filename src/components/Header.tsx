"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth/AuthProvider";
import { getDashboardRoute } from "@/lib/navigation";
import AgoraLogo from "@/components/brand/AgoraLogo";

export default function Header() {
  const pathname = usePathname();
  const { user } = useAuth();
  const [mounted, setMounted] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    // Fetch unread count from API if user is authenticated and not on auth pages
    const isAuthPage = pathname?.startsWith("/auth") || pathname === "/login";
    
    if (user?.id && user?.role && !isAuthPage) {
      fetch("/api/messages/unread-count", {
        credentials: "include",
        cache: "no-store",
      })
        .then((res) => {
          if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
          }
          return res.json();
        })
        .then((data: { count: number }) => {
          setUnreadCount(data.count || 0);
        })
        .catch((error) => {
          console.error("Error fetching unread count:", error);
          setUnreadCount(0);
        });
    } else {
      setUnreadCount(0);
    }
  }, [user, pathname]);

  // Removed window event listeners - refresh only via API fetch
  // Unread count is recalculated when user changes (useEffect above)

  // Don't show navigation buttons on auth pages
  const isAuthPage = pathname?.startsWith("/auth") || pathname === "/login";
  
  // CRITICAL: Use actual user role, NOT pathname, to determine dashboard routing
  const userRole = user?.role;
  const isBuyer = userRole === "BUYER";
  const isSeller = userRole === "SELLER";
  
  // Determine logo variant
  const logoVariant = isBuyer ? "buyer" : isSeller ? "seller" : "auth";

  return (
    <header className="border-b border-zinc-200 dark:border-zinc-800 px-6 py-4">
      <div className="flex items-center justify-between">
        <AgoraLogo variant={logoVariant} />
        <div className="flex items-center gap-3">
          {mounted && user && !isAuthPage && (
            <>
              {/* CRITICAL: Always use getDashboardRoute(user) - single source of truth */}
              {userRole && (
                <>
                  <Link
                    href={getDashboardRoute(user)}
                    className="px-4 py-2 text-sm border border-zinc-300 dark:border-zinc-700 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-900 text-black dark:text-zinc-50 font-medium"
                  >
                    Dashboard
                  </Link>
                  <Link
                    href={isBuyer ? "/buyer/messages" : "/seller/messages"}
                    className="relative px-4 py-2 text-sm border border-zinc-300 dark:border-zinc-700 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-900 text-black dark:text-zinc-50 font-medium"
                  >
                    Messages
                    {unreadCount > 0 && (
                      <span className="absolute -top-2 -right-2 min-w-[20px] h-5 px-1.5 flex items-center justify-center text-xs font-semibold text-white bg-blue-500 rounded-full">
                        {unreadCount > 99 ? "99+" : unreadCount}
                      </span>
                    )}
                  </Link>
                  {isSeller && (
                    <Link
                      href="/seller/feed"
                      className="px-4 py-2 text-sm border border-zinc-300 dark:border-zinc-700 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-900 text-black dark:text-zinc-50 font-medium"
                    >
                      Live Feed
                    </Link>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>
    </header>
  );
}
