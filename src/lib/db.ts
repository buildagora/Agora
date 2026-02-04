/**
 * DEPRECATED: Do not import '@/lib/db'
 * 
 * This file exists only to catch accidental imports and provide a clear error message.
 * 
 * Use '@/lib/db.server' in server code (API routes, server components).
 * Prisma must never be imported in client components.
 */

throw new Error(
  "Do not import '@/lib/db'. Use '@/lib/db.server' in server code only."
);

