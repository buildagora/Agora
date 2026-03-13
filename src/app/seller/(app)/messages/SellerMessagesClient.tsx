"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Card, { CardContent } from "@/components/ui2/Card";
import Button from "@/components/ui2/Button";

interface Conversation {
  id: string;
  buyerId: string;
  buyerName: string;
  buyerEmail: string;
  rfqId?: string | null;
  rfqNumber?: string | null;
  rfqTitle?: string | null;
  rfqStatus?: string | null;
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

interface SellerMessagesClientProps {
  initialConversations: Conversation[];
  initialMessages?: Message[];
  initialConversationId?: string;
  supplierName?: string;
}

export default function SellerMessagesClient({
  initialConversations,
  initialMessages = [],
  initialConversationId,
  supplierName,
}: SellerMessagesClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const conversationIdFromUrl = searchParams.get("conversationId") || initialConversationId;

  const [conversations, setConversations] = useState(initialConversations);
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(
    conversationIdFromUrl || null
  );
  const [messageText, setMessageText] = useState("");
  const [sending, setSending] = useState(false);
  const [deletingMessageId, setDeletingMessageId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  // Sync state when props change (e.g., when server re-renders with new data)
  useEffect(() => {
    setConversations(initialConversations);
  }, [initialConversations]);

  // Sync initialMessages if provided (for server-side initial load)
  useEffect(() => {
    if (initialMessages.length > 0) {
      setMessages(initialMessages);
    }
  }, [initialMessages]);

  // Load messages when conversation is selected
  useEffect(() => {
    if (selectedConversationId) {
      loadMessages(selectedConversationId);
      // Mark notifications as read when conversation is opened
      fetch("/api/seller/notifications/mark-thread-read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: selectedConversationId }),
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.ok) {
            console.log("[SELLER_NOTIFICATIONS_MARKED_READ]", {
              conversationId: selectedConversationId,
              updated: data.updated,
            });
          }
        })
        .catch((err) => {
          console.error("[SELLER_NOTIFICATIONS_MARK_READ_FAILED]", {
            conversationId: selectedConversationId,
            error: err,
          });
        });
    } else {
      setMessages([]);
    }
  }, [selectedConversationId]);

  // Scroll to bottom when messages change
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  async function loadMessages(convId: string) {
    try {
      const response = await fetch(`/api/seller/messages/conversations/${convId}`);
      if (response.ok) {
        const data = await response.json();
        setMessages(data.messages || []);
      }
    } catch (error) {
      console.error("Error loading messages:", error);
    }
  }

  async function handleSendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!messageText.trim() || sending || !selectedConversationId) return;

    setSending(true);
    try {
      const response = await fetch(
        `/api/seller/messages/conversations/${selectedConversationId}/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body: messageText.trim() }),
        }
      );

      if (response.ok) {
        setMessageText("");
        // Reload messages
        await loadMessages(selectedConversationId);
        // Reload conversations list
        const conversationsRes = await fetch("/api/seller/messages/conversations");
        if (conversationsRes.ok) {
          const data = await conversationsRes.json();
          setConversations(data.conversations || []);
        }
      }
    } catch (error) {
      console.error("Error sending message:", error);
    } finally {
      setSending(false);
    }
  }

  async function handleDeleteMessage(messageId: string) {
    if (!selectedConversationId || deletingMessageId) return;

    setDeletingMessageId(messageId);
    try {
      const response = await fetch(
        `/api/seller/messages/conversations/${selectedConversationId}/messages/${messageId}`,
        {
          method: "DELETE",
        }
      );

      if (response.ok) {
        // Reload messages
        await loadMessages(selectedConversationId);
        // Reload conversations list
        const conversationsRes = await fetch("/api/seller/messages/conversations");
        if (conversationsRes.ok) {
          const data = await conversationsRes.json();
          setConversations(data.conversations || []);
        }
      }
    } catch (error) {
      console.error("Error deleting message:", error);
    } finally {
      setDeletingMessageId(null);
    }
  }

  function scrollToBottom() {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }

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

  const selectedConversation = conversations.find((c) => c.id === selectedConversationId);

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left: Conversations List */}
      <div className="w-64 border-r border-zinc-200 dark:border-zinc-800 overflow-y-auto bg-white dark:bg-zinc-900 flex-shrink-0">
        <div className="p-4 border-b border-zinc-200 dark:border-zinc-800">
          <h2 className="text-sm font-semibold text-black dark:text-zinc-50">
            Conversations
          </h2>
        </div>
        <div className="p-2">
          {conversations.length === 0 ? (
            <div className="text-xs text-zinc-500 dark:text-zinc-400 p-4 text-center">
              No conversations yet
            </div>
          ) : (
            conversations.map((conv) => (
              <Card
                key={conv.id}
                className={`mb-2 cursor-pointer transition-colors ${
                  conv.id === selectedConversationId
                    ? "bg-zinc-100 dark:bg-zinc-800"
                    : "hover:bg-zinc-50 dark:hover:bg-zinc-900"
                }`}
                onClick={() => {
                  setSelectedConversationId(conv.id);
                  router.push(`/seller/messages?conversationId=${conv.id}`);
                }}
              >
                <CardContent className="p-3">
                  <div className="flex items-start gap-2">
                    <div className="w-8 h-8 rounded-full bg-zinc-200 dark:bg-zinc-700 flex items-center justify-center flex-shrink-0">
                      <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                        {conv.buyerName.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <div className="text-sm font-medium text-black dark:text-zinc-50 truncate flex-1">
                          {conv.buyerName}
                        </div>
                        {conv.unreadCount && conv.unreadCount > 0 && (
                          <div className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-500 text-white text-xs font-semibold flex items-center justify-center">
                            {conv.unreadCount > 9 ? "9+" : conv.unreadCount}
                          </div>
                        )}
                      </div>
                      {conv.rfqNumber && (
                        <div className="text-xs font-medium text-zinc-700 dark:text-zinc-300 mt-1">
                          {conv.rfqNumber}
                          {conv.rfqTitle && (
                            <span className="text-zinc-500 dark:text-zinc-500 ml-1">
                              • {conv.rfqTitle.length > 30 ? conv.rfqTitle.substring(0, 30) + "..." : conv.rfqTitle}
                            </span>
                          )}
                        </div>
                      )}
                      <div className="text-xs text-zinc-500 dark:text-zinc-400 truncate mt-1">
                        {conv.lastMessagePreview}
                      </div>
                      <div className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">
                        {formatTime(conv.lastMessageAt)}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>

      {/* Center: Conversation */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {selectedConversation ? (
          <>
            {/* Header */}
            <div className="border-b border-zinc-200 dark:border-zinc-800 px-6 py-4 bg-white dark:bg-zinc-900">
              <div className="flex items-center gap-4">
                <button
                  onClick={() => {
                    setSelectedConversationId(null);
                    router.push("/seller/messages");
                  }}
                  className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
                >
                  <svg
                    className="w-5 h-5 text-zinc-600 dark:text-zinc-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 19l-7-7 7-7"
                    />
                  </svg>
                </button>
                <div className="flex-1">
                  <h1 className="text-xl font-semibold text-black dark:text-zinc-50">
                    {selectedConversation.buyerName}
                  </h1>
                  {selectedConversation.buyerEmail && (
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                      {selectedConversation.buyerEmail}
                    </p>
                  )}
                  {selectedConversation.rfqId && selectedConversation.rfqNumber && (
                    <div className="mt-2 flex items-center gap-2">
                      <a
                        href={`/seller/rfqs/${selectedConversation.rfqId}`}
                        className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        {selectedConversation.rfqNumber}
                      </a>
                      {selectedConversation.rfqTitle && (
                        <span className="text-sm text-zinc-500 dark:text-zinc-400">
                          • {selectedConversation.rfqTitle}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Messages */}
            <div
              ref={messagesContainerRef}
              className="flex-1 overflow-y-auto px-6 py-4 space-y-4 bg-zinc-50 dark:bg-zinc-950"
            >
              {messages.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-zinc-600 dark:text-zinc-400">
                    No messages yet. Start the conversation!
                  </p>
                </div>
              ) : (
                messages.map((message) => {
                  const isSupplier = message.senderType === "SUPPLIER";
                  const isAgora = message.senderType === "AGORA";

                  if (isAgora) {
                    return (
                      <div key={message.id} className="flex justify-center my-4">
                        <Card className="bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
                          <CardContent className="p-3">
                            <div className="flex items-center gap-2">
                              <div className="w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center">
                                <span className="text-xs font-bold text-white">A</span>
                              </div>
                              <div>
                                <div className="text-xs font-semibold text-blue-900 dark:text-blue-200 mb-1">
                                  Agora
                                </div>
                                <p className="text-sm text-blue-800 dark:text-blue-300">
                                  {message.body}
                                </p>
                              </div>
                            </div>
                            <div className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                              {formatTime(message.createdAt)}
                            </div>
                          </CardContent>
                        </Card>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={message.id}
                      className={`flex ${isSupplier ? "justify-end" : "justify-start"} group`}
                    >
                      <div
                        className={`max-w-[75%] rounded-lg p-4 shadow-sm relative ${
                          isSupplier
                            ? "bg-slate-600 dark:bg-slate-500 text-white dark:text-black"
                            : "bg-white dark:bg-zinc-800 text-black dark:text-zinc-50 border border-zinc-200 dark:border-zinc-700"
                        }`}
                      >
                        {message.senderDisplayName && (
                          <p className="text-sm font-semibold mb-1.5">
                            {message.senderDisplayName}
                          </p>
                        )}
                        <p className="whitespace-pre-wrap text-sm leading-relaxed">
                          {message.body}
                        </p>
                        <div className="flex items-center justify-between mt-2">
                          <p
                            className={`text-xs ${
                              isSupplier
                                ? "text-slate-200 dark:text-zinc-700"
                                : "text-zinc-500 dark:text-zinc-400"
                            }`}
                          >
                            {formatTime(message.createdAt)}
                          </p>
                          {!isAgora && (
                            <button
                              onClick={() => handleDeleteMessage(message.id)}
                              disabled={deletingMessageId === message.id}
                              className={`ml-2 text-xs transition-colors ${
                                isSupplier
                                  ? "text-slate-300 dark:text-zinc-600 hover:text-slate-100 dark:hover:text-zinc-400"
                                  : "text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300"
                              }`}
                              title="Delete message"
                            >
                              {deletingMessageId === message.id ? "..." : "Delete"}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} className="h-1" />
            </div>

            {/* Message Composer */}
            <div className="border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
              <form onSubmit={handleSendMessage} className="flex gap-2">
                <input
                  type="text"
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  placeholder="Type a message..."
                  className="flex-1 px-4 py-2 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-black dark:text-zinc-50 focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-zinc-50"
                  disabled={sending}
                />
                <Button
                  type="submit"
                  disabled={!messageText.trim() || sending}
                  className="px-4"
                >
                  {sending ? "Sending..." : "Send"}
                </Button>
              </form>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <p className="text-zinc-600 dark:text-zinc-400">
                Select a conversation to view messages
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

