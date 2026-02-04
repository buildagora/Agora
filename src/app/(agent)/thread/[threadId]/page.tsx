"use client";

/**
 * Agent Thread Page - Main Conversation View
 * 
 * This is the core conversation interface for a single thread/job.
 * It follows all canonical draft invariants.
 */

import { useParams } from "next/navigation";
import AgentThreadView from "@/components/agent/AgentThreadView";

export default function AgentThreadPage() {
  const params = useParams();
  const threadId = params.threadId as string;

  if (!threadId) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-zinc-500 dark:text-zinc-400">Invalid thread</p>
      </div>
    );
  }

  return <AgentThreadView threadId={threadId} />;
}

