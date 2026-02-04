/**
 * Server-side environment variable validation
 * Fails fast if required env vars are missing or invalid
 */

export function requireServerEnv(): void {
  const errors: string[] = [];

  // CRITICAL: Check for Prisma engine type forcing client mode
  const prismaEngineType = process.env.PRISMA_CLIENT_ENGINE_TYPE || process.env.PRISMA_ENGINE_TYPE;
  if (prismaEngineType === "client") {
    const whichVar = process.env.PRISMA_CLIENT_ENGINE_TYPE ? "PRISMA_CLIENT_ENGINE_TYPE" : "PRISMA_ENGINE_TYPE";
    throw new Error(
      `ENV_MISCONFIGURED: ${whichVar} is set to "client". ` +
      `This forces Prisma to use client engine which requires Accelerate/adapter. ` +
      `Remove ${whichVar} from .env.local or your shell environment. ` +
      `We use the default Node.js engine, not client engine.`
    );
  }

  // Required in all environments
  if (!process.env.AUTH_SECRET) {
    errors.push("AUTH_SECRET is required");
  } else if (process.env.NODE_ENV === "production" && process.env.AUTH_SECRET.length < 32) {
    errors.push("AUTH_SECRET must be at least 32 characters in production");
  }

  if (!process.env.DATABASE_URL) {
    errors.push("DATABASE_URL is required");
  } else {
    // Warn if connect_timeout is missing (helps prevent hangs when DB is down)
    if (!process.env.DATABASE_URL.includes("connect_timeout")) {
      console.warn(
        "⚠️  DATABASE_URL missing connect_timeout. Add ?connect_timeout=3 to avoid hangs when DB is down.\n" +
        "   Example: postgres://USER:PASS@HOST:5432/DB?connect_timeout=3"
      );
    }
  }

  if (!process.env.NODE_ENV) {
    errors.push("NODE_ENV is required");
  }

  // Production-specific checks
  if (process.env.NODE_ENV === "production") {
    if (process.env.DATABASE_URL?.startsWith("file:")) {
      console.warn("⚠️  SQLite in production is not supported; use Postgres on Railway.");
    }
  }

  if (errors.length > 0) {
    throw new Error(`ENV_MISCONFIGURED: ${errors.join("; ")}`);
  }
}

/**
 * Require OpenAI API key (for Phase 3)
 * Call this when enabling OpenAI features
 */
export function requireOpenAIKey(): string {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("ENV_MISCONFIGURED: OPENAI_API_KEY is required for this feature");
  }
  return process.env.OPENAI_API_KEY;
}

