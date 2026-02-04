"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Sidebar, { SidebarHeader, SidebarContent, SidebarItem } from "@/components/ui2/Sidebar";
import AgoraLogo from "@/components/brand/AgoraLogo";

/**
 * BuyerSidebar - Clean buyer navigation
 * 
 * Structure:
 * - Agent (primary) → /buyer/agent
 * - Requests → /buyer/rfqs
 * - Orders (Open, Completed)
 * - Suppliers (Preferred)
 * - Settings (optional)
 */
export default function BuyerSidebar() {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === "/buyer/agent") {
      return pathname === "/buyer/agent" || pathname?.startsWith("/buyer/agent/thread");
    }
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
          {/* Primary: Agent */}
          <SidebarItem href="/buyer/agent" active={isActive("/buyer/agent")}>
            Agent
          </SidebarItem>

          {/* Requests Section */}
          <div className="mt-6">
            <div className="px-4 py-2 text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
              Requests
            </div>
            <SidebarItem 
              href="/buyer/rfqs" 
              active={isActive("/buyer/rfqs")}
              className="pl-4"
            >
              All Requests
            </SidebarItem>
          </div>

          {/* Orders Section */}
          <div className="mt-6">
            <div className="px-4 py-2 text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
              Orders
            </div>
            <SidebarItem 
              href="/buyer/orders/open" 
              active={isActive("/buyer/orders/open")}
              className="pl-4"
            >
              Open
            </SidebarItem>
            <SidebarItem 
              href="/buyer/orders/completed" 
              active={isActive("/buyer/orders/completed")}
              className="pl-4"
            >
              Completed
            </SidebarItem>
          </div>

          {/* Suppliers Section */}
          <div className="mt-6">
            <div className="px-4 py-2 text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
              Suppliers
            </div>
            <SidebarItem 
              href="/buyer/suppliers/preferred" 
              active={isActive("/buyer/suppliers/preferred")}
              className="pl-4"
            >
              Preferred
            </SidebarItem>
          </div>

          {/* Settings (optional) */}
          <div className="mt-6">
            <SidebarItem 
              href="/buyer/settings" 
              active={isActive("/buyer/settings")}
            >
              Settings
            </SidebarItem>
          </div>
        </nav>
      </SidebarContent>
    </Sidebar>
  );
}

