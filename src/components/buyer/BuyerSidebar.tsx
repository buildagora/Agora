"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import Sidebar, { SidebarHeader, SidebarContent, SidebarItem } from "@/components/ui2/Sidebar";
import Badge from "@/components/ui2/Badge";
import AgoraLogo from "@/components/brand/AgoraLogo";

interface BuyerSidebarProps {
  onNavigate?: () => void;
}

/**
 * BuyerSidebar - Clean buyer navigation
 * 
 * Structure:
 * - Dashboard → /buyer/dashboard
 * - Requests (list) → /buyer/requests
 * - Settings
 */
export default function BuyerSidebar({ onNavigate }: BuyerSidebarProps) {
  const pathname = usePathname();
  const [unreadRfqActivityCount, setUnreadRfqActivityCount] = useState<number>(0);

  // Fetch unread RFQ activity count (for Requests badge)
  const fetchUnreadRfqActivityCount = () => {
    fetch("/api/buyer/rfqs/unread-activity-count", {
      credentials: "include",
      cache: "no-store",
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.ok && typeof data.count === "number") {
          setUnreadRfqActivityCount(data.count);
        }
      })
      .catch(() => {
        // Silently fail - badge just won't show
      });
  };

  // Fetch on mount
  useEffect(() => {
    fetchUnreadRfqActivityCount();
  }, []);

  // Poll for updates every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchUnreadRfqActivityCount();
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  // Refresh on route change
  useEffect(() => {
    fetchUnreadRfqActivityCount();
  }, [pathname]);

  const isActive = (href: string) => {
    if (href === "/buyer/dashboard") {
      return pathname === "/buyer/dashboard";
    }
    return pathname?.startsWith(href);
  };

  return (
    <Sidebar>
      <SidebarHeader>
        <AgoraLogo variant="buyer" />
      </SidebarHeader>
      <SidebarContent>
        <nav className="py-2">
          {/* Primary: Dashboard */}
          <SidebarItem 
            href="/buyer/dashboard" 
            active={isActive("/buyer/dashboard")} 
            onClick={onNavigate}
            className="text-base text-zinc-700 hover:text-black cursor-pointer"
          >
            Dashboard
          </SidebarItem>

          {/* Requests Section */}
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-700 mt-6 mb-2 pl-2">
              REQUESTS
            </div>
            <SidebarItem 
              href="/buyer/requests" 
              active={isActive("/buyer/requests")}
              className="pl-4 text-base text-zinc-700 hover:text-black cursor-pointer"
              onClick={onNavigate}
            >
              <div className="flex items-center justify-between w-full">
                <span>Requests</span>
                {unreadRfqActivityCount === 1 && (
                  <div className="ml-2 w-2 h-2 rounded-full bg-blue-500" />
                )}
                {unreadRfqActivityCount > 1 && (
                  <Badge variant="info" className="ml-2">
                    {unreadRfqActivityCount > 99 ? "99+" : unreadRfqActivityCount}
                  </Badge>
                )}
              </div>
            </SidebarItem>
          </div>

          {/* Account Section */}
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-700 mt-6 mb-2 pl-2">
              ACCOUNT
            </div>
            <SidebarItem 
              href="/buyer/settings" 
              active={isActive("/buyer/settings")}
              className="pl-4 text-base text-zinc-700 hover:text-black cursor-pointer"
              onClick={onNavigate}
            >
              Settings
            </SidebarItem>
          </div>
        </nav>
      </SidebarContent>
    </Sidebar>
  );
}

