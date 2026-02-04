/**
 * Auth module barrel export
 * Re-exports ONLY client functions and types
 * 
 * IMPORTANT: 
 * - Client components should import from "./auth/client" directly
 * - Server components/API routes should import from "./auth/server" directly
 * - This barrel is for backward compatibility but may cause bundling issues
 * 
 * DO NOT re-export server functions here to prevent Prisma from being bundled in client
 */

// Re-export types
export type { User, UserRole, Credentials } from "./auth/types";

// Re-export client functions only (safe for client components)
// NOTE: getAllUsers, getUserByEmail, storeCredentials, verifyCredentials were removed
// as they were part of the old localStorage-based prototype foundation
export {
  getCurrentUser,
  signOut,
} from "./auth/client";

// NOTE: Server functions are NOT re-exported here to prevent Prisma bundling
// Import directly from "./auth/server" in API routes and server components
