"use client";

import React, { useState, useRef, useEffect } from "react";
import Button from "@/components/ui2/Button";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  meta?: {
    questionKey?: string; // Used to prevent duplicate assistant prompts (e.g., "t123|need_category|category")
  };
}

interface ChatProps {
  messages: ChatMessage[];
  onSendMessage: (message: string) => void;
  onQuickReply?: (reply: string) => void;
  quickReplies?: string[];
  disabled?: boolean;
  isSending?: boolean;
  onResetDraft?: () => void;
}

export default function Chat({ messages, onSendMessage, onQuickReply, quickReplies, disabled = false, isSending = false, onResetDraft }: ChatProps) {
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const shouldRefocusRef = useRef(false);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Auto-focus input when sending completes (isSending transitions from true to false)
  useEffect(() => {
    if (!isSending && shouldRefocusRef.current) {
      // Use requestAnimationFrame to ensure the input is enabled before focusing
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
      shouldRefocusRef.current = false;
    }
  }, [isSending]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // CRITICAL: Prevent double submission - return early if already sending
    if (isSending || disabled || !input.trim()) {
      return;
    }
    
    const text = input.trim();
    setInput(""); // Clear input immediately to prevent double send
    // Mark that we should refocus after sending completes
    shouldRefocusRef.current = true;
    // Call onSendMessage once - no duplicate handlers
    onSendMessage(text);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto mb-6 space-y-6 px-2">
        {messages.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-zinc-600 dark:text-zinc-400 text-base">
              I'm Agora, your sales rep. I help you think through the job, make sure nothing's missed, and line up materials and pricing when you're ready.
            </p>
          </div>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[85%] rounded-lg px-4 py-3 ${
                  message.role === "user"
                    ? "bg-slate-600 text-white dark:bg-slate-500"
                    : "bg-zinc-100 dark:bg-zinc-800 text-black dark:text-zinc-50"
                }`}
              >
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Quick Replies */}
      {quickReplies && quickReplies.length > 0 && onQuickReply && (
        <div className="mb-4 flex flex-wrap gap-2">
          {quickReplies.map((reply) => (
            <button
              key={reply}
              onClick={() => onQuickReply(reply)}
              disabled={disabled || isSending}
              className="px-3 py-1.5 text-sm border border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-black dark:text-zinc-50 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors disabled:opacity-50"
            >
              {reply}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type your message..."
          disabled={disabled || isSending}
          className="flex-1 px-4 py-2 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-black dark:text-zinc-50 focus:outline-none focus:ring-2 focus:ring-slate-600 dark:focus:ring-slate-400 disabled:opacity-50"
        />
        <Button
          type="submit"
          variant="primary"
          size="md"
          disabled={!input.trim() || disabled || isSending}
        >
          Send
        </Button>
      </form>
      
      {/* Reset Draft Control (Dev Only) */}
      {process.env.NODE_ENV !== "production" && onResetDraft && (
        <div className="mt-2">
          <button
            onClick={onResetDraft}
            className="text-xs text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 underline"
            type="button"
          >
            Reset draft
          </button>
        </div>
      )}
    </div>
  );
}

