/**
 * Shared types for the chat feature. Safe to import from client and server.
 */

export type ChatRole = "user" | "model";

export type ChatAttachmentMeta = {
  /** Filename or human-readable label. May be empty. */
  name: string;
  mimeType: string;
  sizeBytes: number;
};

export type ChatMessage = {
  role: ChatRole;
  text: string;
  /** ISO 8601 string */
  createdAt: string;
  /** Metadata only — bytes are not persisted in v1. */
  attachments?: ChatAttachmentMeta[];
};

export type ChatThreadSummary = {
  id: string;
  title: string | null;
  updatedAt: string;
  messageCount: number;
};

export type ChatThreadDetail = ChatThreadSummary & {
  messages: ChatMessage[];
};

export const ANON_COOKIE_NAME = "agora_chat_anon";
