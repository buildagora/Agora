"use client";

import React from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { signOut } from "@/lib/auth/client";
import Sidebar, { SidebarHeader, SidebarContent, SidebarItem } from "./Sidebar";
import Topbar from "./Topbar";
import Button from "./Button";
import AgoraLogo from "@/components/brand/AgoraLogo";

interface AppShellProps {
  role?: "buyer" | "seller";
  active?: string;
  children: React.ReactNode;
  className?: string;
}

export default function AppShell({
  role = "buyer",
  active = "dashboard",
  children,
  className = "",
}: AppShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  
  const buyerNavItems = [
    { href: "/buyer/dashboard", label: "Dashboard" },
    { href: "/buyer/rfqs", label: "Material Requests" },
    { href: "/buyer/find", label: "Supplier Discovery" },
    { href: "/buyer/settings/preferred-suppliers", label: "Preferred Suppliers" },
    { href: "/buyer/messages", label: "Messages" },
    // /buyer/orders and /buyer/settings are placeholder pages - hidden for now
  ];

  const sellerNavItems = [
    { href: "/seller/dashboard", label: "Dashboard" },
    { href: "/seller/feed", label: "RFQ Feed" },
    { href: "/seller/invites", label: "Direct Invites" },
    { href: "/seller/messages", label: "Action Queue" },
    { href: "/seller/scorecard", label: "Scorecard" },
    { href: "/seller/settings", label: "Settings" },
  ];

  // On /buyer/agent, only show Dashboard in sidebar
  const isAgentPage = pathname?.startsWith("/buyer/agent");
  const filteredBuyerNavItems = isAgentPage 
    ? buyerNavItems.filter(item => item.href === "/buyer/dashboard")
    : buyerNavItems;

  const navItems = role === "buyer" ? filteredBuyerNavItems : sellerNavItems;
  
  // Logo variant based on role
  const logoVariant = role === "buyer" ? "buyer" : role === "seller" ? "seller" : "auth";

  const handleSignOut = async () => {
    const loginPath = await signOut();
    router.replace(loginPath);
    router.refresh();
  };

  // If no role, render without sidebar (for landing/auth pages)
  if (!role) {
    return (
      <div className={`flex min-h-screen flex-col bg-zinc-50 dark:bg-black ${className}`}>
        <main className="flex-1">
          {children}
        </main>
      </div>
    );
  }

  return (
    <div className={`flex h-screen bg-zinc-50 dark:bg-black ${className}`}>
      <Sidebar>
        <SidebarHeader>
          <AgoraLogo variant={logoVariant} />
        </SidebarHeader>
        <SidebarContent>
          <nav className="py-4">
            {navItems.map((item) => (
              <SidebarItem
                key={item.href}
                href={item.href}
                active={active === item.href || active === item.href.split("/").pop() || (active === "dashboard" && item.href.includes("dashboard"))}
              >
                {item.label}
              </SidebarItem>
            ))}
          </nav>
        </SidebarContent>
      </Sidebar>
      <div className="flex-1 flex flex-col overflow-hidden">
        <Topbar>
          <div className="flex items-center justify-between w-full">
            {!isAgentPage && (
              <h2 className="text-lg font-semibold text-black dark:text-zinc-50">
                {navItems.find((item) => item.href.includes(active))?.label || (role === "buyer" ? "Dashboard" : "Dashboard")}
              </h2>
            )}
            {isAgentPage && <div />}
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
                <div className="w-8 h-8 rounded-full bg-zinc-200 dark:bg-zinc-700 hover:bg-zinc-300 dark:hover:bg-zinc-600 transition-colors cursor-pointer"></div>
              </Link>
            </div>
          </div>
        </Topbar>
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
