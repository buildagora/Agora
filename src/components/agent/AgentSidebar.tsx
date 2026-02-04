"use client";

/**
 * Agent Sidebar - Thread/Job Navigation
 * 
 * Displays:
 * - Header with "New Job" button
 * - Recent jobs (threads) list
 * - Tools (future: Past Orders, RFQ Drafts, Settings)
 */

import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import {
  getSortedThreads,
  createThread,
  deleteThread,
  renameThread,
  type AgentThread,
} from "@/lib/agentThreads";
import Button from "@/components/ui2/Button";
import ConfirmDialog from "@/components/ConfirmDialog";
import AgoraLogo from "@/components/brand/AgoraLogo";

export default function AgentSidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const [threads, setThreads] = useState<AgentThread[]>([]);
  const [editingThreadId, setEditingThreadId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [deleteThreadId, setDeleteThreadId] = useState<string | null>(null);

  // Extract threadId from pathname (e.g., /buyer/agent/thread/abc123)
  const activeThreadId = pathname?.match(/\/thread\/([^/]+)/)?.[1] || null;

  useEffect(() => {
    // Load threads on mount
    (async () => {
      const threads = await getSortedThreads();
      setThreads(threads);
    })();
    
    // Listen for custom event from same-window updates
    const handleThreadsUpdated = async () => {
      const threads = await getSortedThreads();
      setThreads(threads);
    };
    
    window.addEventListener("agora:threads:updated", handleThreadsUpdated);
    
    return () => {
      window.removeEventListener("agora:threads:updated", handleThreadsUpdated);
    };
  }, []);

  const handleNewJob = async () => {
    const newThread = await createThread();
    router.push(`/buyer/agent/thread/${newThread.id}`);
  };

  const handleSelectThread = (threadId: string) => {
    if (!editingThreadId) {
      router.push(`/buyer/agent/thread/${threadId}`);
    }
  };

  const handleStartRename = (thread: AgentThread) => {
    setEditingThreadId(thread.id);
    setEditTitle(thread.title);
  };

  const handleSaveRename = async (threadId: string) => {
    if (editTitle.trim()) {
      await renameThread(threadId, editTitle.trim());
      const threads = await getSortedThreads();
      setThreads(threads);
      // Dispatch event for other components
      window.dispatchEvent(new Event("agora:threads:updated"));
    }
    setEditingThreadId(null);
    setEditTitle("");
  };

  const handleCancelRename = () => {
    setEditingThreadId(null);
    setEditTitle("");
  };

  const handleDeleteClick = (threadId: string) => {
    setDeleteThreadId(threadId);
  };

  const handleConfirmDelete = async () => {
    if (deleteThreadId) {
      await deleteThread(deleteThreadId);
      const threads = await getSortedThreads();
      setThreads(threads);
      window.dispatchEvent(new Event("agora:threads:updated"));
      
      // If deleting active thread, redirect to latest or create new
      if (deleteThreadId === activeThreadId) {
        const remaining = await getSortedThreads();
        if (remaining.length > 0) {
          router.push(`/buyer/agent/thread/${remaining[0].id}`);
        } else {
          const newThread = await createThread();
          router.push(`/buyer/agent/thread/${newThread.id}`);
        }
      }
      
      setDeleteThreadId(null);
    }
  };

  const handleCancelDelete = () => {
    setDeleteThreadId(null);
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return "Today";
    } else if (diffDays === 1) {
      return "Yesterday";
    } else if (diffDays < 7) {
      return date.toLocaleDateString("en-US", { weekday: "short" });
    } else {
      return date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      });
    }
  };

  // Get last message preview for each thread
  const getLastMessagePreview = (thread: AgentThread): string => {
    if (thread.messages.length === 0) return "New conversation";
    const lastMessage = thread.messages[thread.messages.length - 1];
    const preview = lastMessage.content.substring(0, 50);
    return preview.length < lastMessage.content.length ? `${preview}...` : preview;
  };

  return (
    <div className="w-64 border-r border-zinc-200 dark:border-zinc-700 flex flex-col bg-white dark:bg-zinc-900">
      {/* Header */}
      <div className="p-4 border-b border-zinc-200 dark:border-zinc-800">
        <div className="mb-3">
          <AgoraLogo variant="buyer" />
        </div>
        <Button
          variant="primary"
          size="sm"
          onClick={handleNewJob}
          className="w-full"
        >
          + New Job
        </Button>
      </div>

      {/* Threads List */}
      <div className="flex-1 overflow-y-auto">
        {threads.length === 0 ? (
          <div className="p-4 text-center">
            <p className="text-sm text-zinc-500 dark:text-zinc-500">
              No jobs yet
            </p>
          </div>
        ) : (
          <div className="py-2">
            {threads.map((thread) => {
              const isActive = thread.id === activeThreadId;
              const isEditing = editingThreadId === thread.id;

              return (
                <div
                  key={thread.id}
                  className={`group relative px-3 py-2 mx-2 rounded-lg cursor-pointer transition-colors ${
                    isActive
                      ? "bg-slate-100 dark:bg-slate-800"
                      : "hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  }`}
                  onClick={() => !isEditing && handleSelectThread(thread.id)}
                >
                  {isEditing ? (
                    <div className="space-y-2">
                      <input
                        type="text"
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            handleSaveRename(thread.id);
                          } else if (e.key === "Escape") {
                            handleCancelRename();
                          }
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="w-full px-2 py-1 text-sm border border-zinc-300 dark:border-zinc-700 rounded bg-white dark:bg-zinc-900 text-black dark:text-zinc-50 focus:outline-none focus:ring-2 focus:ring-slate-600 dark:focus:ring-slate-400"
                        autoFocus
                      />
                      <div className="flex gap-1">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSaveRename(thread.id);
                          }}
                          className="text-xs px-2 py-1 bg-slate-600 text-white rounded hover:bg-slate-700"
                        >
                          Save
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCancelRename();
                          }}
                          className="text-xs px-2 py-1 bg-zinc-200 dark:bg-zinc-700 text-black dark:text-zinc-50 rounded hover:bg-zinc-300 dark:hover:bg-zinc-600"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-black dark:text-zinc-50 truncate">
                            {thread.title}
                          </p>
                          <p className="text-xs text-zinc-500 dark:text-zinc-500 mt-0.5 line-clamp-1">
                            {getLastMessagePreview(thread)}
                          </p>
                          <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">
                            {formatDate(thread.updatedAt)}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleStartRename(thread);
                            }}
                            className="p-1 text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
                            title="Rename"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteClick(thread.id);
                            }}
                            className="p-1 text-zinc-500 hover:text-red-600 dark:text-zinc-400 dark:hover:text-red-400 transition-colors"
                            title="Delete"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Tools Section (Phase 1: Read-only / Navigation) */}
      <div className="border-t border-zinc-200 dark:border-zinc-800 p-4">
        <nav className="space-y-2">
          <Link
            href="/buyer/orders"
            className="block text-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-50 transition-colors"
          >
            Past Orders
          </Link>
          <Link
            href="/buyer/settings"
            className="block text-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-50 transition-colors"
          >
            Settings
          </Link>
        </nav>
      </div>

      {/* Delete Confirmation Modal */}
      <ConfirmDialog
        isOpen={deleteThreadId !== null}
        title="Delete job?"
        message="This cannot be undone."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={handleConfirmDelete}
        onCancel={handleCancelDelete}
        variant="danger"
      />
    </div>
  );
}


/**
 * Agent Sidebar - Thread/Job Navigation
 * 
 * Displays:
 * - Header with "New Job" button
 * - Recent jobs (threads) list
 * - Tools (future: Past Orders, RFQ Drafts, Settings)
 */

import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import {
  getSortedThreads,
  createThread,
  deleteThread,
  renameThread,
  type AgentThread,
} from "@/lib/agentThreads";
import Button from "@/components/ui2/Button";
import ConfirmDialog from "@/components/ConfirmDialog";
import AgoraLogo from "@/components/brand/AgoraLogo";

