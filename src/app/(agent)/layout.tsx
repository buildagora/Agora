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

import { ReactNode } from "react";
import AgentSidebar from "@/components/agent/AgentSidebar";

interface AgentLayoutProps {
  children: ReactNode;
}

export default function AgentLayout({ children }: AgentLayoutProps) {
  return (
    <div className="flex h-screen bg-white dark:bg-zinc-900">
      <AgentSidebar />
      <div className="flex-1 flex flex-col overflow-hidden bg-zinc-50 dark:bg-black">
        {children}
      </div>
    </div>
  );
}

