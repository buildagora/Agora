"use client";

import { useRouter } from "next/navigation";
import { signOut } from "@/lib/auth/client";
import BuyerSidebar from "./BuyerSidebar";
import Topbar from "@/components/ui2/Topbar";
import Button from "@/components/ui2/Button";
import Link from "next/link";

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

  const handleSignOut = async () => {
    const loginPath = await signOut();
    router.replace(loginPath);
    router.refresh();
  };

  return (
    <div className="flex h-screen bg-white dark:bg-zinc-900">
      <BuyerSidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Topbar>
          <div className="flex items-center justify-between w-full">
            <div />
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


