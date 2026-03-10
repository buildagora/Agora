/**
 * Pure utilities shared by the agent turn pipeline.
 * Keep this file free of routing/state machine logic.
 */

/**
 * Simple hash function (djb2) for idempotency
 * Stable, fast, non-crypto hash
 */
export function hashString(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) + hash + str.charCodeAt(i);
  }
  return Math.abs(hash).toString(36);
}

/**
 * Extract category from message text (utility only)
 */
export function extractCategory(message: string): string | null {
  // Keep behavior identical to legacy helper for now
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { parseCategory } = require("./parse");
  return parseCategory(message);
}
