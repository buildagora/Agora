"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "@/lib/auth/client";
import BuyerSidebar from "./BuyerSidebar";
import Topbar from "@/components/ui2/Topbar";
import Button from "@/components/ui2/Button";
import Link from "next/link";
import Sheet from "@/components/ui2/Sheet";
import AgoraLogo from "@/components/brand/AgoraLogo";

interface BuyerShellProps {
  children: React.ReactNode;
}

/**
 * BuyerShell - Unified shell layout for all buyer pages
 * 
 * Provides:
 * - Left sidebar (BuyerSidebar with new navigation)
 * - Main content area
 * - Top bar with profile/sign out
 * 
 * This shell wraps all buyer routes to ensure consistent UI.
 */
export default function BuyerShell({ children }: BuyerShellProps) {
  const router = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleSignOut = async () => {
    const redirectPath = await signOut();
    router.replace(redirectPath);

  };

  return (
    <div className="flex min-h-dvh bg-white overflow-x-hidden">
      {/* Desktop Sidebar - hidden on mobile */}
      <div className="hidden md:flex">
        <BuyerSidebar />
      </div>

      {/* Mobile Sheet/Drawer */}
      <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
        <BuyerSidebar onNavigate={() => setMobileMenuOpen(false)} />
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
              {/* Mobile logo */}
              <div className="md:hidden">
                <AgoraLogo variant="buyer" />
              </div>
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
        <main className="flex-1 overflow-y-auto min-w-0">
          {children}
        </main>
      </div>
    </div>
  );
}


