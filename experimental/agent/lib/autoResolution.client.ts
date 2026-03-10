/**
 * Auto-Resolution System - Client-Safe
 * Client-side wrapper that calls API routes for auto-resolution
 * 
 * DO NOT IMPORT server-only modules here
 */

import { Message } from "./messages";

/**
 * Auto-resolution result
 */
export interface AutoResolutionResult {
  shouldEscalate: boolean; // Whether to create an action item
  autoResponse?: string; // Auto-generated response message
  confidence: number; // Confidence level (0-1)
  reason?: string; // Reason for escalation or auto-resolution
}

/**
 * Auto-resolve a buyer message intent
 * Calls API route instead of server-only function
 */
export async function autoResolveBuyerIntent(
  message: Message,
  sellerId: string
): Promise<AutoResolutionResult> {
  try {
    const res = await fetch("/api/agent/auto-resolve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        message,
        sellerId,
      }),
    });

    if (!res.ok) {
      throw new Error(`API error: ${res.status}`);
    }

    const data = await res.json();
    if (data.ok && data.result) {
      return data.result;
    }

    throw new Error("Invalid API response");
  } catch (error) {
    // Safe fallback on error
    return {
      shouldEscalate: true,
      confidence: 0.0,
      reason: error instanceof Error ? error.message : "Failed to process buyer message",
    };
  }
}

/**
 * Auto-resolve a buyer message
 * Calls API route instead of server-only function
 */
export async function autoResolveBuyerMessage(
  message: Message,
  sellerId: string
): Promise<AutoResolutionResult> {
  return autoResolveBuyerIntent(message, sellerId);
}


