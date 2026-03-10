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
  draft?: any;
  onReviewAndSend?: () => void;
  canConfirm?: boolean;
  showCreating?: boolean;
  bottomInsetPx?: number; // Bottom inset for fixed composer on mobile
}

export default function Chat({ 
  messages, 
  onSendMessage, 
  onQuickReply, 
  quickReplies, 
  disabled = false, 
  isSending = false, 
  onResetDraft,
  draft,
  onReviewAndSend,
  canConfirm = false,
  showCreating = false,
  bottomInsetPx = 0,
}: ChatProps) {
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const composerRef = useRef<HTMLFormElement>(null);
  const draftCardRef = useRef<HTMLDivElement>(null);
  const [composerHeight, setComposerHeight] = useState(0);
  const [composerOnlyHeight, setComposerOnlyHeight] = useState(0);
  const shouldRefocusRef = useRef(false);

  // Measure composer and draft card heights for messages container padding
  useEffect(() => {
    const updateHeight = () => {
      requestAnimationFrame(() => {
        const composerOnly = composerRef.current?.offsetHeight || 0;
        const draftCardHeight = (canConfirm && draft && onReviewAndSend) 
          ? (draftCardRef.current?.offsetHeight || 0)
          : 0;
        setComposerOnlyHeight(composerOnly);
        setComposerHeight(composerOnly + draftCardHeight);
      });
    };
    
    updateHeight();
    
    const resizeObserver = new ResizeObserver(updateHeight);
    if (composerRef.current) {
      resizeObserver.observe(composerRef.current);
    }
    if (draftCardRef.current) {
      resizeObserver.observe(draftCardRef.current);
    }
    
    return () => resizeObserver.disconnect();
  }, [draft, canConfirm, onReviewAndSend]);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    if (messagesContainerRef.current) {
      const container = messagesContainerRef.current;
      // Scroll to bottom smoothly, but only if user is near bottom
      const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 200;
      if (isNearBottom) {
        container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
      }
    }
  }, [messages]);

  // Auto-grow textarea height
  useEffect(() => {
    const textarea = inputRef.current;
    if (!textarea) return;

    const adjustHeight = () => {
      // Reset height to auto to get accurate scrollHeight
      textarea.style.height = 'auto';
      const scrollHeight = textarea.scrollHeight;
      const maxHeight = 120; // ~5 lines
      const newHeight = Math.min(scrollHeight, maxHeight);
      textarea.style.height = `${newHeight}px`;
      textarea.style.overflowY = scrollHeight > maxHeight ? 'auto' : 'hidden';
    };

    // Adjust height when input value changes
    adjustHeight();
    
    // Also adjust on input event (for paste, etc.)
    const handleInput = () => {
      requestAnimationFrame(adjustHeight);
    };
    textarea.addEventListener('input', handleInput);
    
    return () => textarea.removeEventListener('input', handleInput);
  }, [input]);

  // Handle input focus: scroll messages to keep content visible, never show blank (iMessage-like)
  useEffect(() => {
    const textarea = inputRef.current;
    if (!textarea) return;

    const handleFocus = () => {
      // Use requestAnimationFrame to ensure layout is stable
      requestAnimationFrame(() => {
        if (messagesContainerRef.current) {
          const container = messagesContainerRef.current;
          const scrollHeight = container.scrollHeight;
          const clientHeight = container.clientHeight;
          
          // If content fits in viewport (not overflowing), do NOTHING - keep first message visible
          if (scrollHeight <= clientHeight) {
            return;
          }
          
          // If content is overflowing, scroll to bottom smoothly (like iMessage)
          // This shows the most recent messages when keyboard opens
          container.scrollTo({ 
            top: scrollHeight - clientHeight, 
            behavior: 'smooth' 
          });
        }
      });
    };

    textarea.addEventListener("focus", handleFocus);
    return () => textarea.removeEventListener("focus", handleFocus);
  }, [messages.length]);

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
    // Reset textarea height
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
    }
    // Mark that we should refocus after sending completes
    shouldRefocusRef.current = true;
    // Call onSendMessage once - no duplicate handlers
    onSendMessage(text);
  };

  // Handle Enter key: send on Enter, newline on Shift+Enter
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as any);
    }
    // Shift+Enter allows newline (default behavior)
  };

  return (
    <div className="flex flex-col h-full overflow-hidden relative">
      {/* Messages - only this scrolls, with padding for fixed composer */}
      <div 
        ref={messagesContainerRef}
        className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 py-4 space-y-6 md:pb-0"
        style={{ 
          scrollPaddingBottom: '96px',
          paddingBottom: `max(${composerHeight}px, env(safe-area-inset-bottom, 0px))`
        }}
      >
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
        <div ref={messagesEndRef} className="h-1" />
      </div>

      {/* Draft Review Card - fixed above composer on mobile */}
      {canConfirm && draft && onReviewAndSend && (
        <div 
          ref={draftCardRef}
          className="md:relative fixed left-0 right-0 px-4 pt-2 pb-2 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 z-40"
          style={{
            bottom: `${composerOnlyHeight}px`,
            transform: `translateY(-${bottomInsetPx}px)`,
          }}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-black dark:text-zinc-50 truncate">
                {draft.jobNameOrPo || "Draft ready"}
              </p>
              <p className="text-xs text-zinc-600 dark:text-zinc-400 truncate">
                {draft.categoryLabel || (draft.categoryId ? draft.categoryId : "")} • {draft.lineItems?.length || 0} items
              </p>
            </div>
            <Button
              variant="primary"
              size="sm"
              onClick={onReviewAndSend}
              disabled={showCreating}
            >
              {showCreating ? "Creating..." : "Review & Send"}
            </Button>
          </div>
        </div>
      )}

      {/* Quick Replies */}
      {quickReplies && quickReplies.length > 0 && onQuickReply && (
        <div className="px-4 pb-2 flex flex-wrap gap-2">
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

      {/* Input - fixed on mobile, sticky on desktop */}
      <form 
        ref={composerRef}
        onSubmit={handleSubmit} 
        className="md:sticky md:bottom-0 fixed left-0 right-0 border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 pt-3 shrink-0 z-50"
        style={{
          bottom: 0,
          transform: `translateY(-${bottomInsetPx}px)`,
          paddingBottom: `max(env(safe-area-inset-bottom), 12px)`,
        }}
        onFocus={(e) => {
          // Prevent any document-level scrolling when input focuses
          e.stopPropagation();
        }}
      >
        <div className="flex gap-2 items-end">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type your message..."
            disabled={disabled || isSending}
            rows={1}
            className="flex-1 min-w-0 px-4 py-2 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-black dark:text-zinc-50 focus:outline-none focus:ring-2 focus:ring-slate-600 dark:focus:ring-slate-400 disabled:opacity-50 resize-none overflow-y-auto whitespace-pre-wrap break-words"
            style={{ 
              maxHeight: '120px',
              minHeight: '44px', // Match button height
            }}
          />
          <Button
            type="submit"
            variant="primary"
            size="md"
            disabled={!input.trim() || disabled || isSending}
            className="shrink-0"
          >
            Send
          </Button>
        </div>
      </form>
      
      {/* Reset Draft Control (Dev Only) */}
      {process.env.NODE_ENV !== "production" && onResetDraft && (
        <div className="px-4 pb-2">
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

