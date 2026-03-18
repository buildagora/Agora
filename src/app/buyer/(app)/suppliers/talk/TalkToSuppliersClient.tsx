"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Card, { CardContent } from "@/components/ui2/Card";
import Button from "@/components/ui2/Button";

interface Conversation {
  id: string;
  supplierId: string;
  supplierName: string;
  lastMessagePreview: string;
  lastMessageAt: string;
  unreadCount?: number;
}

export default function TalkToSuppliersClient({
  initialCategoryId,
  initialConversations,
}: {
  initialCategoryId: string;
  initialConversations: Conversation[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supplierIdFromUrl = searchParams.get("supplierId");

  const [conversations, setConversations] = useState<Conversation[]>(initialConversations);

  // Handle deep-link: if supplierId is in URL, redirect to thread page
  useEffect(() => {
    if (supplierIdFromUrl) {
      router.replace(`/buyer/suppliers/talk/${supplierIdFromUrl}`);
    }
  }, [supplierIdFromUrl, router]);

  // Fetch conversations on mount
  useEffect(() => {
    fetch("/api/buyer/suppliers/conversations")
      .then((res) => res.json())
      .then((data) => {
        if (data.ok && data.conversations) {
          setConversations(data.conversations || []);
        }
      })
      .catch((err) => {
        console.error("Error fetching conversations:", err);
      });
  }, []);

  function formatTime(dateString: string) {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left: Conversations List */}
      <div className="w-full md:w-64 border-r border-zinc-200 dark:border-zinc-800 overflow-y-auto bg-white dark:bg-zinc-900 flex-shrink-0">
        <div className="p-4 border-b border-zinc-200 dark:border-zinc-800">
          <h2 className="text-sm font-semibold text-black dark:text-zinc-50 mb-3">
            Messages
          </h2>
          <Button
            onClick={() => router.push("/buyer/suppliers")}
            className="w-full text-sm"
            variant="primary"
          >
            New message
          </Button>
        </div>
        <div className="p-3 pt-4">
          {conversations.length === 0 ? (
            <div className="text-xs text-zinc-500 dark:text-zinc-400 p-4 text-center">
              No conversations yet
            </div>
          ) : (
            conversations.map((conv) => (
              <Link
                key={conv.id}
                href={`/buyer/suppliers/talk/${conv.supplierId}`}
                className="block"
              >
                <Card className="mb-2.5 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors">
                  <CardContent className="p-3.5">
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-full bg-zinc-200 dark:bg-zinc-700 flex items-center justify-center flex-shrink-0">
                        <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                          {conv.supplierName.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <div className="text-sm font-semibold text-black dark:text-zinc-50 truncate flex-1">
                            {conv.supplierName}
                          </div>
                          {conv.unreadCount && conv.unreadCount > 0 && (
                            <div className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-500 text-white text-xs font-semibold flex items-center justify-center">
                              {conv.unreadCount > 9 ? "9+" : conv.unreadCount}
                            </div>
                          )}
                        </div>
                        <div className="text-xs text-zinc-500 dark:text-zinc-400 truncate mb-1">
                          {conv.lastMessagePreview}
                        </div>
                        <div className="text-xs text-zinc-400 dark:text-zinc-500">
                          {formatTime(conv.lastMessageAt)}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))
          )}
        </div>
      </div>

      {/* Right: Empty State */}
      <div className="flex-1 overflow-y-auto p-6 hidden md:block">
        <div className="flex items-center justify-center h-full">
          <div className="text-center max-w-md px-6">
            <h3 className="text-lg font-semibold text-black dark:text-zinc-50 mb-2">
              Select a conversation
            </h3>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Choose a supplier conversation from the left.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
