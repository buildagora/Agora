/**
 * Feature Flags Configuration
 * 
 * Centralized feature flag management for the Agora application.
 * Feature flags are controlled via environment variables (NEXT_PUBLIC_*).
 * 
 * Default behavior: if env var is missing, feature is disabled (false).
 */

export const FEATURES = {
  /**
   * Agent Feature Flag
   * Controls visibility of all Agent UI entry points and routes.
   * 
   * Set NEXT_PUBLIC_AGENT_ENABLED=true in .env.local to enable.
   * Default: false (disabled)
   */
  AGENT_ENABLED: process.env.NEXT_PUBLIC_AGENT_ENABLED === "true",
} as const;



