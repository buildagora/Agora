"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth/AuthProvider";
// Removed localStorage imports - using APIs instead
// TODO: Remove legacy message functions when Message model is added to Prisma
import { parseThreadId } from "@/lib/messages";
import Card, { CardContent } from "@/components/ui2/Card";
import Badge from "@/components/ui2/Badge";

export default function BuyerMessagesInboxPage() {
  const { user } = useAuth(); // NEW FOUNDATION: Server is source of truth
  const [threads, setThreads] = useState<Array<{
    summary: {
      threadId: string;
      requestId?: string;
      buyerId?: string;
      sellerId?: string;
      lastMessageAt?: string;
      lastMessagePreview?: string;
    };
    counterpartyName: string;
    unreadCount: number;
  }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // NEW FOUNDATION: AuthGuard handles auth/role checks
    // This effect only loads data when user is authenticated and role matches
    if (!user || user.role !== "BUYER") {
      setLoading(false);
      return;
    }

    // Load threads from API (server queries database)
    (async () => {
      try {
        const res = await fetch("/api/buyer/messages", {
          cache: "no-store",
          credentials: "include",
        });
        
        if (!res.ok) {
          setThreads([]);
          setLoading(false);
          return;
        }
        
        const responseData = await res.json();
        const apiThreads = Array.isArray(responseData) ? responseData : (responseData.data || []);
        
        // Map API response to expected format
        const enrichedThreads = apiThreads.map((thread: any) => {
          // Get seller (counterparty) name
          let counterpartyName: string;
          if (thread.sellerId === "__unassigned__" || !thread.sellerId) {
            counterpartyName = "Awaiting supplier assignment";
          } else {
            // TODO: Load seller name from database API
            counterpartyName = thread.sellerName || thread.sellerId;
          }

          return {
            summary: {
              threadId: thread.threadId || thread.id,
              requestId: thread.rfqId || thread.requestId,
              buyerId: thread.buyerId || user.id,
              sellerId: thread.sellerId || "__unassigned__",
              lastMessageAt: thread.lastMessageAt || thread.updatedAt || thread.createdAt,
            },
            counterpartyName,
            unreadCount: thread.unreadCount || 0,
          };
        });

        setThreads(enrichedThreads);
      } catch (error) {
        console.error("Error loading messages:", error);
        setThreads([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [user]);

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

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-zinc-600">Loading...</p>
      </div>
    );
  }

  return (
      <div className="flex flex-1 flex-col px-6 py-8 max-w-6xl mx-auto w-full">
        <div className="mb-6">
          <h1 className="text-3xl font-semibold text-black">
            Messages
          </h1>
          <p className="text-sm text-zinc-600 mt-1">
            Your message threads with sellers
          </p>
        </div>

        {threads.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <p className="text-zinc-600">
                No messages yet. Start a conversation from a request.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="flex flex-col gap-3">
            {threads.map(({ summary, counterpartyName, unreadCount }) => {
              // Parse threadId to get requestId and sellerId for linking
              const parsed = parseThreadId(summary.threadId);
              if (!parsed) return null;

              return (
                <Link
                  key={summary.threadId}
                  href={`/buyer/messages/${parsed.requestId}?sellerId=${parsed.sellerId}`}
                >
                  <Card className="hover:bg-zinc-50 transition-colors">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium text-black">
                              {counterpartyName}
                            </span>
                            {unreadCount > 0 && (
                              <Badge variant="info" className="text-xs">
                                {unreadCount}
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-zinc-600 mb-1">
                            Request {parsed.requestId.substring(0, 8)}
                          </p>
                          <p className="text-sm text-zinc-500 truncate">
                            {summary.lastMessagePreview}
                          </p>
                        </div>
                        <div className="text-xs text-zinc-500 whitespace-nowrap">
                          {summary.lastMessageAt ? formatDate(summary.lastMessageAt) : ""}
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
  );
}

