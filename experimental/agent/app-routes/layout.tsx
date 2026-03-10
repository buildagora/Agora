"use client";

/**
 * Agent Layout - ChatGPT-style UI
 * 
 * This layout provides:
 * - Left sidebar for thread navigation
 * - Main conversation pane (via children/outlet)
 * 
 * DOES NOT:
 * - Fetch agent data
 * - Mutate draft
 * - Contain AuthGuard logic (handled by parent buyer layout)
 */

import { ReactNode, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { FEATURES } from "@/config/features";
import AgentSidebar from "@/components/agent/AgentSidebar";
import Sheet from "@/components/ui2/Sheet";
import AgoraLogo from "@/components/brand/AgoraLogo";

interface AgentLayoutProps {
  children: ReactNode;
}

export default function AgentLayout({ children }: AgentLayoutProps) {
  const router = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    if (!FEATURES.AGENT_ENABLED) {
      router.replace("/");
    }
  }, [router]);

  if (!FEATURES.AGENT_ENABLED) {
    return null;
  }

  return (
    <div className="flex min-h-dvh bg-white dark:bg-zinc-900 overflow-x-hidden">
      {/* Desktop Sidebar - hidden on mobile */}
      <div className="hidden md:flex">
        <AgentSidebar />
      </div>

      {/* Mobile Sheet/Drawer */}
      <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
        <AgentSidebar />
      </Sheet>

      <div className="flex-1 flex flex-col overflow-hidden bg-zinc-50 dark:bg-black min-w-0">
        {/* Mobile header with hamburger */}
        <div className="md:hidden bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => setMobileMenuOpen(true)}
            className="p-2 -ml-2 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-50"
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
          <AgoraLogo variant="buyer" />
        </div>
        {children}
      </div>
    </div>
  );
}

