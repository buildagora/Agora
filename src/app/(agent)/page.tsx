"use client";

/**
 * Agent Default Page
 * Redirects to latest thread or creates a new one
 */

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getSortedThreads, createThread } from "@/lib/agentThreads";

export default function AgentDefaultPage() {
  const router = useRouter();

  useEffect(() => {
    (async () => {
      const threads = await getSortedThreads();
      
      if (threads.length > 0) {
        // Redirect to latest thread
        router.replace(`/buyer/agent/thread/${threads[0].id}`);
      } else {
        // Create new thread and redirect
        const newThread = await createThread();
        router.replace(`/buyer/agent/thread/${newThread.id}`);
      }
    })();
  }, [router]);

  return (
    <div className="flex items-center justify-center h-full">
      <p className="text-zinc-500 dark:text-zinc-400">Loading...</p>
    </div>
  );
}


/**
 * Agent Default Page
 * Redirects to latest thread or creates a new one
 */

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getSortedThreads, createThread } from "@/lib/agentThreads";

export default function AgentDefaultPage() {
  const router = useRouter();

  useEffect(() => {
    (async () => {
      const threads = await getSortedThreads();
      
      if (threads.length > 0) {
        // Redirect to latest thread
        router.replace(`/buyer/agent/thread/${threads[0].id}`);
      } else {
        // Create new thread and redirect
        const newThread = await createThread();
        router.replace(`/buyer/agent/thread/${newThread.id}`);
      }
    })();
  }, [router]);

  return (
    <div className="flex items-center justify-center h-full">
      <p className="text-zinc-500 dark:text-zinc-400">Loading...</p>
    </div>
  );
}

