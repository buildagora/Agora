"use client";

/**
 * RFQ Clarifications Component
 * 
 * Displays and allows sending messages in an RFQ-scoped conversation
 * directly from the RFQ detail page.
 */

import { useEffect, useState, useRef } from "react";
import Button from "@/components/ui2/Button";
import Card, { CardContent } from "@/components/ui2/Card";
import Badge from "@/components/ui2/Badge";

interface Message {
  id: string;
  senderType: "BUYER" | "SUPPLIER" | "AGORA";
  senderDisplayName: string | null;
  body: string;
  createdAt: string;
}

interface RFQClarificationsProps {
  rfqId: string;
}

export default function RFQClarifications({ rfqId }: RFQClarificationsProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [messageBody, setMessageBody] = useState("");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load messages on mount
  useEffect(() => {
    const loadMessages = async () => {
      try {
        const res = await fetch(`/api/seller/messages/rfq/${rfqId}/messages`, {
          credentials: "include",
        });

        if (res.ok) {
          const data = await res.json();
          setMessages(data.messages || []);
          setConversationId(data.conversationId);
        }
      } catch (error) {
        console.error("Error loading messages:", error);
      } finally {
        setLoading(false);
      }
    };

    loadMessages();
  }, [rfqId]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!messageBody.trim() || sending) {
      return;
    }

    setSending(true);

    try {
      const res = await fetch(`/api/seller/messages/rfq/${rfqId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ body: messageBody.trim() }),
      });

      if (res.ok) {
        const data = await res.json();
        setMessageBody("");
        
        // Reload messages
        const messagesRes = await fetch(`/api/seller/messages/rfq/${rfqId}/messages`, {
          credentials: "include",
        });
        if (messagesRes.ok) {
          const messagesData = await messagesRes.json();
          setMessages(messagesData.messages || []);
          setConversationId(messagesData.conversationId);
        }
      } else {
        const error = await res.json();
        alert(error.message || "Failed to send message");
      }
    } catch (error) {
      console.error("Error sending message:", error);
      alert("Failed to send message. Please try again.");
    } finally {
      setSending(false);
    }
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">Loading clarifications...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-6">
        <div className="mb-4">
          <h3 className="text-lg font-semibold text-black dark:text-zinc-50">
            Clarifications
          </h3>
          <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">
            Ask the buyer questions about this RFQ
          </p>
        </div>

        {/* Messages List */}
        <div className="mb-4 max-h-96 overflow-y-auto border border-zinc-200 dark:border-zinc-800 rounded-lg p-4 space-y-3">
          {messages.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                No messages yet. Ask the buyer a question to get started.
              </p>
            </div>
          ) : (
            messages.map((msg) => {
              const isSupplier = msg.senderType === "SUPPLIER";
              return (
                <div
                  key={msg.id}
                  className={`flex ${isSupplier ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[80%] rounded-lg p-3 ${
                      isSupplier
                        ? "bg-black dark:bg-zinc-50 text-white dark:text-black"
                        : "bg-zinc-100 dark:bg-zinc-800 text-black dark:text-zinc-50"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-medium">
                        {msg.senderDisplayName || (isSupplier ? "You" : "Buyer")}
                      </span>
                      <span className="text-xs opacity-70">
                        {formatTime(msg.createdAt)}
                      </span>
                    </div>
                    <p className="text-sm whitespace-pre-wrap">{msg.body}</p>
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Message Composer */}
        <form onSubmit={handleSend} className="space-y-3">
          <textarea
            value={messageBody}
            onChange={(e) => setMessageBody(e.target.value)}
            placeholder="Ask the buyer a question about this RFQ..."
            rows={3}
            className="w-full px-4 py-2 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-black dark:text-zinc-50 focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-zinc-50 resize-none"
            disabled={sending}
          />
          <div className="flex justify-end">
            <Button
              type="submit"
              variant="primary"
              size="md"
              disabled={!messageBody.trim() || sending}
            >
              {sending ? "Sending..." : "Send Message"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

