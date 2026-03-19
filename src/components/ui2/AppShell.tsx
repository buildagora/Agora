"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { signOut } from "@/lib/auth/client";
import Sidebar, { SidebarHeader, SidebarContent, SidebarItem } from "./Sidebar";
import Topbar from "./Topbar";
import Button from "./Button";
import Badge from "./Badge";
import AgoraLogo from "@/components/brand/AgoraLogo";
import Sheet from "./Sheet";

interface AppShellProps {
  role?: "buyer" | "seller";
  active?: string;
  children: React.ReactNode;
  className?: string;
  /** Optional class for the <main> element. Default preserves overflow-y-auto for normal page scrolling. */
  mainClassName?: string;
}

export default function AppShell({
  role = "buyer",
  active = "dashboard",
  children,
  className = "",
  mainClassName,
}: AppShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const isAgentPage = false;
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [unreadRfqActivityCount, setUnreadRfqActivityCount] = useState<number>(0);
  
  // Seller-specific attention indicators
  const [sellerBroadcastRfqCount, setSellerBroadcastRfqCount] = useState<number>(0);
  const [sellerDirectRfqCount, setSellerDirectRfqCount] = useState<number>(0);

  // Fetch unread notification count (for messages)
  const fetchUnreadCount = () => {
    const endpoint = role === "buyer" 
      ? "/api/buyer/notifications/unread-count"
      : role === "seller"
      ? "/api/seller/notifications/unread-count"
      : null;

    if (!endpoint) return;

    fetch(endpoint)
      .then((res) => res.json())
      .then((data) => {
        if (data.ok && typeof data.unread === "number") {
          setUnreadCount(data.unread);
        }
      })
      .catch(() => {
        // Silently fail - badge just won't show
      });
  };

  // Fetch unread RFQ activity count (for Material Requests badge - buyer only)
  const fetchUnreadRfqActivityCount = () => {
    if (role !== "buyer") return;

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

  // Fetch seller RFQ visible counts (broadcast and direct)
  // Uses the same filtering logic as the actual feed/invites pages
  const fetchSellerRfqActivityCounts = () => {
    if (role !== "seller") return;

    // Fetch broadcast count (same logic as /seller/feed)
    fetch("/api/seller/rfqs?visibility=broadcast&count=true", {
      credentials: "include",
      cache: "no-store",
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.ok && typeof data.count === "number") {
          setSellerBroadcastRfqCount(data.count);
        }
      })
      .catch(() => {
        // Silently fail - indicators just won't show
      });

    // Fetch direct count (same logic as /seller/invites)
    fetch("/api/seller/rfqs?visibility=direct&count=true", {
      credentials: "include",
      cache: "no-store",
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.ok && typeof data.count === "number") {
          setSellerDirectRfqCount(data.count);
        }
      })
      .catch(() => {
        // Silently fail - indicators just won't show
      });
  };

  // Fetch on mount and when role changes
  useEffect(() => {
    fetchUnreadCount();
    fetchUnreadRfqActivityCount();
    fetchSellerRfqActivityCounts();
  }, [role]);

  // Poll for updates every 30 seconds
  useEffect(() => {
    if (!role) return;
    const interval = setInterval(() => {
      fetchUnreadCount();
      fetchUnreadRfqActivityCount();
      fetchSellerRfqActivityCounts();
    }, 30000);
    return () => clearInterval(interval);
  }, [role]);

  // Refresh on route change
  useEffect(() => {
    if (role) {
      fetchUnreadCount();
      fetchUnreadRfqActivityCount();
      fetchSellerRfqActivityCounts();
    }
  }, [pathname, role]);
  
  const buyerNavItems = [
    { href: "/buyer/dashboard", label: "Dashboard" },
    { href: "/buyer/rfqs", label: "Material Requests" },
    { href: "/buyer/find", label: "Supplier Discovery" },
    { href: "/buyer/settings/preferred-suppliers", label: "Preferred Suppliers" },
    { href: "/buyer/messages", label: "Messages" },
    // Find Materials is the dashboard; no separate nav item
  ];

  const sellerNavItems = [
    { href: "/seller/dashboard", label: "Dashboard" },
    { href: "/seller/feed", label: "RFQ Feed" },
    { href: "/seller/invites", label: "Direct Invites" },
    { href: "/seller/messages", label: "Messages" },
    { href: "/seller/scorecard", label: "Scorecard" },
    { href: "/seller/settings", label: "Settings" },
  ];

  // Buyer navigation items
  const filteredBuyerNavItems = buyerNavItems;

  const navItems = role === "buyer" ? filteredBuyerNavItems : sellerNavItems;
  
  // Logo variant based on role
  const logoVariant = role === "buyer" ? "buyer" : role === "seller" ? "seller" : "auth";

  const handleSignOut = async () => {
    const redirectPath = await signOut();
    router.replace(redirectPath);

  };

  // If no role, render without sidebar (for landing/auth pages)
  if (!role) {
    return (
      <div className={`flex min-h-screen flex-col bg-zinc-50 ${className}`}>
        <main className={mainClassName ? `flex-1 min-w-0 ${mainClassName}` : "flex-1"}>
          {children}
        </main>
      </div>
    );
  }

  const sidebarContent = (
    <>
      <SidebarHeader>
        <AgoraLogo variant={logoVariant} />
      </SidebarHeader>
      <SidebarContent>
        <nav className="py-4">
          {navItems.map((item) => {
            // BUYER attention indicators
            const isBuyerMessagesItem = role === "buyer" && item.href.includes("/messages");
            const showBuyerMessagesBadge = isBuyerMessagesItem && unreadCount > 0;
            
            const isBuyerRfqsItem = role === "buyer" && item.href === "/buyer/rfqs";
            const showBuyerRfqActivityBadge = isBuyerRfqsItem && unreadRfqActivityCount > 0;
            
            // SELLER attention indicators
            const isSellerMessagesItem = role === "seller" && item.href.includes("/messages");
            const showSellerMessagesBadge = isSellerMessagesItem && unreadCount > 0;
            
            const isSellerFeedItem = role === "seller" && item.href === "/seller/feed";
            const showSellerFeedBadge = isSellerFeedItem && sellerBroadcastRfqCount > 0;
            
            const isSellerInvitesItem = role === "seller" && item.href === "/seller/invites";
            const showSellerInvitesBadge = isSellerInvitesItem && sellerDirectRfqCount > 0;
            
            // Determine if any indicator should show
            const showBadge = showBuyerMessagesBadge || showBuyerRfqActivityBadge || 
                             showSellerMessagesBadge || showSellerFeedBadge || showSellerInvitesBadge;
            
            // Calculate badge count
            let badgeCount = 0;
            if (showBuyerMessagesBadge) badgeCount = unreadCount;
            else if (showBuyerRfqActivityBadge) badgeCount = unreadRfqActivityCount;
            else if (showSellerMessagesBadge) badgeCount = unreadCount;
            else if (showSellerFeedBadge) badgeCount = sellerBroadcastRfqCount;
            else if (showSellerInvitesBadge) badgeCount = sellerDirectRfqCount;
            
            // Show blue dot for single items, badge for counts > 1
            const showDot = badgeCount === 1;
            const showCountBadge = badgeCount > 1;
            
            return (
              <SidebarItem
                key={item.href}
                href={item.href}
                active={active === item.href || active === item.href.split("/").pop() || (active === "dashboard" && item.href.includes("dashboard"))}
                onClick={() => setMobileMenuOpen(false)}
              >
                <div className="flex items-center justify-between w-full">
                  <span>{item.label}</span>
                  {showDot && (
                    <div className="ml-2 w-2 h-2 rounded-full bg-blue-500" />
                  )}
                  {showCountBadge && (
                    <Badge variant="info" className="ml-2">
                      {badgeCount > 99 ? "99+" : badgeCount}
                    </Badge>
                  )}
                </div>
              </SidebarItem>
            );
          })}
        </nav>
      </SidebarContent>
    </>
  );

  return (
    <div className={`flex min-h-dvh bg-zinc-50 overflow-x-hidden ${className}`}>
      {/* Desktop Sidebar - hidden on mobile */}
      <div className="hidden md:flex">
        <Sidebar>
          {sidebarContent}
        </Sidebar>
      </div>

      {/* Mobile Sheet/Drawer */}
      <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
        <Sidebar>
          {sidebarContent}
        </Sidebar>
      </Sheet>

      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <Topbar>
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-3">
              {/* Mobile hamburger button */}
              <button
                onClick={() => setMobileMenuOpen(true)}
                className="md:hidden p-2 -ml-2 text-zinc-600 hover:text-zinc-900"
                aria-label="Open menu"
              >
                <svg
                  className="w-6 h-6"
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
              {/* Mobile logo/title */}
              <div className="md:hidden">
                <AgoraLogo variant={logoVariant} />
              </div>
              {!isAgentPage && (
                <h2 className="hidden md:block text-lg font-semibold text-black">
                  {navItems.find((item) => item.href.includes(active))?.label || (role === "buyer" ? "Dashboard" : "Dashboard")}
                </h2>
              )}
              {isAgentPage && <div className="hidden md:block" />}
            </div>
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSignOut}
                className="text-sm"
              >
                Sign out
              </Button>
              <Link href="/profile" aria-label="View profile">
                <div className="w-8 h-8 rounded-full bg-zinc-200 hover:bg-zinc-300 transition-colors cursor-pointer"></div>
              </Link>
            </div>
          </div>
        </Topbar>
        <main className={`flex-1 min-w-0 ${mainClassName ?? "overflow-y-auto"}`}>
          {children}
        </main>
      </div>
    </div>
  );
}
