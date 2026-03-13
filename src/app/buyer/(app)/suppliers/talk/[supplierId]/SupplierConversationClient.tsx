"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui2/Button";

interface Supplier {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
}

interface Conversation {
  id: string;
  supplierId: string;
  supplierName: string;
  rfqId?: string | null;
  rfqNumber?: string | null;
  rfqTitle?: string | null;
  lastMessagePreview: string;
  lastMessageAt: string;
  unreadCount?: number;
}

interface Message {
  id: string;
  senderType: "BUYER" | "SUPPLIER" | "AGORA";
  senderDisplayName?: string | null;
  body: string;
  createdAt: string;
}

interface SupplierConversationClientProps {
  supplier: Supplier;
  conversations: Conversation[];
  messages: Message[];
  conversationId: string;
  supplierId: string;
  buyerName?: string;
  rfqId?: string | null;
  rfqNumber?: string | null;
  rfqTitle?: string | null;
}

function clampPreview(s: string, max = 80) {
  const t = (s || "").replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return t.slice(0, max - 1) + "…";
}

function isNearBottom(el: HTMLElement, thresholdPx = 220) {
  const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
  return distance <= thresholdPx;
}

export default function SupplierConversationClient({
  supplier,
  conversations: initialConversations,
  messages: initialMessages,
  conversationId,
  supplierId,
  rfqId,
  rfqNumber,
  rfqTitle,
}: SupplierConversationClientProps) {
  const router = useRouter();

  const [conversations, setConversations] = useState(initialConversations);
  const [messages, setMessages] = useState(initialMessages);

  const [messageText, setMessageText] = useState("");
  const [sending, setSending] = useState(false);
  const [deletingMessageId, setDeletingMessageId] = useState<string | null>(null);
  const [deletingConversationId, setDeletingConversationId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  // track whether we should autoscroll on new messages
  const shouldAutoScrollRef = useRef(true);
  // force scroll after user sends
  const forceScrollNextRef = useRef(false);

  // Sync state when props change (e.g., when navigating between conversations)
  useEffect(() => {
    setMessages(initialMessages);
    // Reset auto-scroll when switching conversations
    shouldAutoScrollRef.current = true;
    forceScrollNextRef.current = true;
  }, [initialMessages, conversationId]);

  useEffect(() => {
    setConversations(initialConversations);
  }, [initialConversations]);

  // Mark notifications as read when conversation is opened
  useEffect(() => {
    if (!conversationId) return;

    fetch("/api/buyer/notifications/mark-thread-read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data?.ok) {
          // noop
        }
      })
      .catch(() => {
        // noop
      });
  }, [conversationId]);

  // listen to user scroll so we don't yank them to bottom
  useEffect(() => {
    const el = messagesContainerRef.current;
    if (!el) return;

    const onScroll = () => {
      shouldAutoScrollRef.current = isNearBottom(el);
    };

    el.addEventListener("scroll", onScroll, { passive: true });
    // initialize
    shouldAutoScrollRef.current = isNearBottom(el);

    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const el = messagesContainerRef.current;
    if (!el) return;

    const shouldScroll = forceScrollNextRef.current || shouldAutoScrollRef.current;
    if (!shouldScroll) return;

    forceScrollNextRef.current = false;
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function formatTime(dateString: string) {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m`;
    if (diffHours < 24) return `${diffHours}h`;
    if (diffDays < 7) return `${diffDays}d`;
    return date.toLocaleDateString();
  }

  function formatDayLabel(dateString: string) {
    const d = new Date(dateString);
    const today = new Date();
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    const startOfThat = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const diffDays = Math.round((startOfToday - startOfThat) / 86400000);

    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  }

  const messageRows = useMemo(() => {
    // Insert day separators
    const rows: Array<
      | { type: "day"; key: string; label: string }
      | { type: "msg"; key: string; msg: Message }
    > = [];

    let lastDayKey: string | null = null;

    for (const msg of messages) {
      const d = new Date(msg.createdAt);
      const dayKey = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

      if (dayKey !== lastDayKey) {
        rows.push({ type: "day", key: `day-${dayKey}`, label: formatDayLabel(msg.createdAt) });
        lastDayKey = dayKey;
      }

      rows.push({ type: "msg", key: msg.id, msg });
    }

    return rows;
  }, [messages]);

  async function reloadConversationAndSidebar() {
    // Reload messages for the current conversation using conversationId
    // This is the canonical way to reload the exact selected thread
    if (conversationId) {
      const conversationRes = await fetch(`/api/buyer/suppliers/conversations/by-id/${conversationId}`);
      if (conversationRes.ok) {
        const data = await conversationRes.json();
        if (data.ok) {
          setMessages(data.messages || []);
          // Update RFQ context if available
          if (data.rfqId && data.rfqNumber) {
            // Update the conversation in the list if needed
            setConversations(prev => prev.map(conv => 
              conv.id === conversationId 
                ? { ...conv, rfqId: data.rfqId, rfqNumber: data.rfqNumber, rfqTitle: data.rfqTitle }
                : conv
            ));
          }
        }
      }
    }

    // Reload conversations list for sidebar
    const conversationsRes = await fetch("/api/buyer/suppliers/conversations");
    if (conversationsRes.ok) {
      const data = await conversationsRes.json();
      if (data.ok) {
        setConversations(data.conversations || []);
      }
    }
  }

  async function handleSendMessage() {
    const body = messageText.trim();
    if (!body || sending) return;

    setSending(true);
    try {
      // Determine if this is an RFQ-scoped conversation
      const currentConv = conversations.find(c => c.id === conversationId);
      let response: Response;
      
      if (currentConv?.rfqId) {
        // RFQ-scoped conversation - use RFQ endpoint
        response = await fetch(`/api/buyer/rfqs/${currentConv.rfqId}/conversations/${supplierId}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body }),
        });
      } else {
        // General conversation - use supplier endpoint
        response = await fetch(`/api/buyer/suppliers/conversations/${supplierId}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body }),
        });
      }

      if (response.ok) {
        setMessageText("");
        forceScrollNextRef.current = true;
        await reloadConversationAndSidebar();
      }
    } catch (error) {
      console.error("Error sending message:", error);
    } finally {
      setSending(false);
    }
  }

  async function handleDeleteMessage(messageId: string) {
    if (!conversationId || deletingMessageId) return;

    setDeletingMessageId(messageId);
    try {
      const response = await fetch(
        `/api/buyer/suppliers/conversations/by-id/${conversationId}/messages/${messageId}`,
        {
          method: "DELETE",
        }
      );

      if (response.ok) {
        await reloadConversationAndSidebar();
      }
    } catch (error) {
      console.error("Error deleting message:", error);
    } finally {
      setDeletingMessageId(null);
    }
  }

  async function handleDeleteConversation(convId: string) {
    if (deletingConversationId) return;
    const confirmed = window.confirm("Delete this conversation?");
    if (!confirmed) return;

    setDeletingConversationId(convId);
    try {
      const res = await fetch(`/api/buyer/suppliers/conversations/by-id/${convId}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const text = await res.text();
        console.error("Failed to delete conversation", res.status, text);
        return;
      }

      const wasActive = convId === conversationId;
      
      // Reload conversations list
      const conversationsRes = await fetch("/api/buyer/suppliers/conversations");
      if (conversationsRes.ok) {
        const data = await conversationsRes.json();
        if (data.ok) {
          const nextConversations = data.conversations || [];
          setConversations(nextConversations);

          if (wasActive) {
            if (nextConversations.length > 0) {
              const next = nextConversations[0];
              router.push(`/buyer/suppliers/talk/${next.supplierId}?conversationId=${encodeURIComponent(next.id)}`);
            } else {
              router.push("/buyer/suppliers/talk");
            }
          }
        }
      }
    } catch (err) {
      console.error("Failed to delete conversation", err);
    } finally {
      setDeletingConversationId(null);
    }
  }

  return (
    <div className="flex h-full overflow-hidden bg-zinc-50 dark:bg-zinc-950">
      {/* Sidebar (md+) */}
      <aside className="hidden md:flex w-[320px] border-r border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex-col">
        <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Messages</h2>
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              {conversations.length}
            </span>
          </div>
        </div>

        <div className="p-2 overflow-y-auto">
          {conversations.length === 0 ? (
            <div className="text-sm text-zinc-500 dark:text-zinc-400 p-6 text-center">
              No conversations yet
            </div>
          ) : (
            conversations.map((conv) => {
              const active = conv.id === conversationId;
              const unread = conv.unreadCount && conv.unreadCount > 0 ? conv.unreadCount : 0;
              const isRFQConversation = conv.rfqId && conv.rfqNumber;

              return (
                <button
                  key={conv.id}
                  type="button"
                  onClick={() => router.push(`/buyer/suppliers/talk/${conv.supplierId}?conversationId=${encodeURIComponent(conv.id)}`)}
                  className={[
                    "w-full text-left rounded-xl px-3 py-3 mb-1 transition-colors",
                    active
                      ? "bg-zinc-100 dark:bg-zinc-800"
                      : "hover:bg-zinc-50 dark:hover:bg-zinc-950",
                    "focus:outline-none focus:ring-2 focus:ring-zinc-900/10 dark:focus:ring-zinc-50/10",
                  ].join(" ")}
                >
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-full bg-zinc-200 dark:bg-zinc-700 flex items-center justify-center flex-shrink-0">
                      <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">
                        {conv.supplierName?.charAt(0)?.toUpperCase() || "S"}
                      </span>
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <div className="text-sm font-medium text-zinc-900 dark:text-zinc-50 truncate flex-1">
                          {conv.supplierName}
                        </div>
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleDeleteConversation(conv.id);
                          }}
                          disabled={deletingConversationId === conv.id}
                          className="flex-shrink-0 p-1 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded transition-colors"
                          title="Delete conversation"
                        >
                          {deletingConversationId === conv.id ? (
                            <span className="text-xs text-zinc-400 dark:text-zinc-500">...</span>
                          ) : (
                            <svg
                              className="w-4 h-4 text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                              />
                            </svg>
                          )}
                        </button>
                        <div className="text-xs text-zinc-500 dark:text-zinc-400 flex-shrink-0">
                          {formatTime(conv.lastMessageAt)}
                        </div>
                      </div>

                      {/* RFQ context or "General conversation" label */}
                      {isRFQConversation ? (
                        <div className="text-xs font-medium text-zinc-700 dark:text-zinc-300 mt-1 truncate">
                          {conv.rfqNumber}
                          {conv.rfqTitle && (
                            <span className="text-zinc-500 dark:text-zinc-500 ml-1">
                              • {conv.rfqTitle.length > 30 ? conv.rfqTitle.substring(0, 30) + "..." : conv.rfqTitle}
                            </span>
                          )}
                        </div>
                      ) : (
                        <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                          General conversation
                        </div>
                      )}

                      <div className="flex items-center gap-2 mt-1">
                        <div className="text-xs text-zinc-600 dark:text-zinc-400 truncate flex-1">
                          {clampPreview(conv.lastMessagePreview, 90)}
                        </div>
                        {unread > 0 && (
                          <div className="flex-shrink-0 min-w-[20px] h-5 px-1.5 rounded-full bg-zinc-900 text-white text-[11px] font-semibold flex items-center justify-center">
                            {unread > 99 ? "99+" : unread}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </aside>

      {/* Main conversation */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Header */}
        <header className="border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 sm:px-6 py-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push("/buyer/suppliers/talk")}
              className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
              aria-label="Back to messages"
            >
              <svg
                className="w-5 h-5 text-zinc-700 dark:text-zinc-300"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>

            <div className="min-w-0 flex-1">
              <h1 className="text-lg sm:text-xl font-semibold text-zinc-900 dark:text-zinc-50 truncate">
                {supplier.name}
              </h1>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-zinc-600 dark:text-zinc-400">
                {supplier.email ? <span className="truncate">{supplier.email}</span> : null}
                {supplier.phone ? <span className="truncate">{supplier.phone}</span> : null}
              </div>
              {rfqId && rfqNumber && (
                <div className="mt-2 flex items-center gap-2">
                  <a
                    href={`/buyer/rfqs/${rfqId}`}
                    className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    {rfqNumber}
                  </a>
                  {rfqTitle && (
                    <span className="text-sm text-zinc-500 dark:text-zinc-400">
                      • {rfqTitle}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Messages */}
        <main
          ref={messagesContainerRef}
          className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 bg-zinc-50 dark:bg-zinc-950"
        >
          {messages.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-zinc-600 dark:text-zinc-400">
                No messages yet. Start the conversation!
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {messageRows.map((row) => {
                if (row.type === "day") {
                  return (
                    <div key={row.key} className="flex justify-center py-2">
                      <div className="text-xs px-3 py-1 rounded-full bg-white/70 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400">
                        {row.label}
                      </div>
                    </div>
                  );
                }

                const message = row.msg;
                const isBuyer = message.senderType === "BUYER";
                const isAgora = message.senderType === "AGORA";

                if (isAgora) {
                  return (
                    <div key={row.key} className="flex justify-center py-1">
                      <div className="max-w-[720px] px-3 py-2 rounded-full text-xs sm:text-sm bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300">
                        <span className="font-semibold mr-2">Agora</span>
                        <span className="whitespace-pre-wrap">{message.body}</span>
                        <span className="ml-2 text-[11px] text-zinc-500 dark:text-zinc-400">
                          · {formatTime(message.createdAt)}
                        </span>
                      </div>
                    </div>
                  );
                }

                return (
                  <div
                    key={row.key}
                    className={`flex ${isBuyer ? "justify-end" : "justify-start"} group`}
                  >
                    <div className={`max-w-[78%] sm:max-w-[70%]`}>
                      {/* optional name for supplier-side */}
                      {!isBuyer && message.senderDisplayName ? (
                        <div className="text-xs text-zinc-500 dark:text-zinc-400 mb-1 px-1">
                          {message.senderDisplayName}
                        </div>
                      ) : null}

                      <div
                        className={[
                          "rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap relative",
                          isBuyer
                            ? "bg-zinc-900 text-white"
                            : "bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-50 border border-zinc-200 dark:border-zinc-800",
                        ].join(" ")}
                      >
                        {message.body}
                      </div>

                      <div
                        className={[
                          "flex items-center gap-2 text-[11px] mt-1 px-1",
                          isBuyer ? "text-zinc-500 dark:text-zinc-400 justify-end" : "text-zinc-500 dark:text-zinc-400",
                        ].join(" ")}
                      >
                        <span>{formatTime(message.createdAt)}</span>
                        {!isAgora && (
                          <button
                            onClick={() => handleDeleteMessage(message.id)}
                            disabled={deletingMessageId === message.id}
                            className="transition-colors text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300"
                            title="Delete message"
                          >
                            {deletingMessageId === message.id ? "..." : "Delete"}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div ref={messagesEndRef} className="h-1" />
        </main>

        {/* Composer */}
        <div className="border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 sm:px-6 py-3">
          <div className="flex items-end gap-2">
            <textarea
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void handleSendMessage();
                }
              }}
              placeholder="Type a message…"
              className="flex-1 resize-none min-h-[44px] max-h-[160px] px-4 py-3 border border-zinc-300 dark:border-zinc-700 rounded-xl bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 dark:focus:ring-zinc-50/10"
              disabled={sending}
              rows={1}
            />

            <Button
              type="button"
              onClick={() => void handleSendMessage()}
              disabled={!messageText.trim() || sending}
              className="px-4 h-[44px]"
            >
              {sending ? "Sending…" : "Send"}
            </Button>
          </div>

          <div className="mt-2 text-[11px] text-zinc-500 dark:text-zinc-400">
            Enter to send · Shift+Enter for a new line
          </div>
        </div>
      </div>
    </div>
  );
}
