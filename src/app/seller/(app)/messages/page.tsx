"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth/AuthProvider";
import type { ThreadSummary } from "@/lib/messages";
import Card, { CardContent } from "@/components/ui2/Card";
import Badge from "@/components/ui2/Badge";
import AppShell from "@/components/ui2/AppShell";

interface RFQ {
  id: string;
  rfqNumber: string;
  status: "OPEN" | "AWARDED" | "CLOSED";
  title: string;
}

export default function SellerMessagesInboxPage() {
  const { user: currentUser, status } = useAuth();
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [rfqs, setRfqs] = useState<RFQ[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Wait for auth to load
    if (status === "loading") {
      return;
    }

    if (!currentUser || currentUser.role !== "SELLER") {
      setLoading(false);
      return;
    }

    // TODO: Load RFQs from database API instead of storage
    // For now, use empty array
    const allRfqs: RFQ[] = [];
    setRfqs(allRfqs);

    // TODO: Load active threads from database API
    // For now, use empty array
    setThreads([]);
    setLoading(false);
  }, [currentUser, status]);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return date.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
      });
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

  const getRfqForThread = (thread: ThreadSummary): RFQ | undefined => {
    return rfqs.find((rfq) => rfq.id === thread.requestId);
  };

  const getBuyerName = (): string => {
    // TODO: Load buyer name from database API when available
    return "Buyer";
  };

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-zinc-600 dark:text-zinc-400">Loading...</p>
      </div>
    );
  }

  return (
    <AppShell role="seller" active="messages">
      <div className="flex flex-1 flex-col px-6 py-8 max-w-6xl mx-auto w-full">
        <div className="mb-6">
          <h1 className="text-3xl font-semibold text-black dark:text-zinc-50">
            Messages
          </h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">
            Active conversations with buyers
          </p>
        </div>

        {threads.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <p className="text-zinc-600 dark:text-zinc-400">
                No active conversations.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="flex flex-col gap-3">
            {threads.map((thread) => {
              const rfq = getRfqForThread(thread);
              const buyerName = getBuyerName();
              const needsReply = thread.lastSenderRole === "BUYER";

              return (
                <Link
                  key={thread.threadId}
                  href={`/seller/messages/${thread.requestId}`}
                >
                  <Card className="hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2">
                            {rfq && (
                              <span className="font-semibold text-black dark:text-zinc-50">
                                {rfq.rfqNumber}
                              </span>
                            )}
                            {rfq && (
                              <Badge variant={rfq.status === "OPEN" ? "info" : "default"} className="text-xs">
                                {rfq.status}
                              </Badge>
                            )}
                            {needsReply && (
                              <Badge variant="warning" className="text-xs">
                                Needs Reply
                              </Badge>
                            )}
                          </div>
                          <h3 className="font-medium text-black dark:text-zinc-50 mb-1">
                            {rfq ? rfq.title : `Request ${thread.requestId.substring(0, 8)}`}
                          </h3>
                          <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-2 line-clamp-2">
                            {thread.lastMessagePreview}
                          </p>
                          <div className="flex items-center gap-3 text-xs text-zinc-500 dark:text-zinc-500">
                            <span>{buyerName}</span>
                            <span>•</span>
                            <span>Request {thread.requestId.substring(0, 8)}</span>
                          </div>
                        </div>
                        <div className="text-xs text-zinc-500 dark:text-zinc-500 whitespace-nowrap">
                          {formatDate(thread.lastMessageAt)}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}

