/**
 * Simple in-memory rate limiting (token bucket)
 * Suitable for beta deployment on single Railway instance
 * For production scale, migrate to Redis
 */

interface RateLimitState {
  tokens: number;
  lastRefill: number;
}

// In-memory store: Map<key, RateLimitState>
const rateLimitStore = new Map<string, RateLimitState>();

/**
 * Get client IP from request
 */
export function getClientIp(request: Request): string {
  // Check x-forwarded-for header (Railway/proxy)
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    // Take first IP if multiple
    return forwardedFor.split(",")[0].trim();
  }
  
  // Fallback: use a default key if IP unavailable
  return "unknown";
}

/**
 * Check rate limit
 * @param key - Rate limit key (userId or IP)
 * @param maxTokens - Maximum tokens allowed
 * @param refillRate - Tokens per second
 * @param windowSeconds - Time window in seconds
 * @returns true if allowed, false if rate limited
 */
export function checkRateLimit(
  key: string,
  maxTokens: number,
  refillRate: number,
  _windowSeconds: number = 60
): boolean {
  const now = Date.now();
  const state = rateLimitStore.get(key);

  if (!state) {
    // First request: initialize with maxTokens
    rateLimitStore.set(key, {
      tokens: maxTokens - 1,
      lastRefill: now,
    });
    return true;
  }

  // Refill tokens based on time elapsed
  const elapsed = (now - state.lastRefill) / 1000; // seconds
  const tokensToAdd = Math.floor(elapsed * refillRate);
  const newTokens = Math.min(state.tokens + tokensToAdd, maxTokens);

  if (newTokens < 1) {
    // Rate limited
    return false;
  }

  // Consume one token
  rateLimitStore.set(key, {
    tokens: newTokens - 1,
    lastRefill: now,
  });

  // Cleanup old entries (simple: remove if last refill > 1 hour ago)
  if (now - state.lastRefill > 3600000) {
    rateLimitStore.delete(key);
  }

  return true;
}

/**
 * Rate limit configuration presets
 */
export const RATE_LIMITS = {
  LOGIN: { maxTokens: 10, refillRate: 10 / 60 }, // 10 per minute
  AGENT_TURN: { maxTokens: 60, refillRate: 60 / 60 }, // 60 per minute
  RFQ_CREATE: { maxTokens: 30, refillRate: 30 / 60 }, // 30 per minute
} as const;


