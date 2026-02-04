/**
 * Prisma Resolution Guard
 * 
 * DEV-ONLY guard that fails fast if Prisma Client is being resolved from repo root
 * instead of from /agora/node_modules/@prisma/client
 * 
 * This prevents Node.js module resolution from walking upward and finding the wrong Prisma Client.
 */

// Removed server-only: This module is used by scripts and API routes
import { createRequire } from "module";
import path from "path";
import { fileURLToPath } from "url";

const REPO_ROOT = "/Users/michael/agora";
const APP_DIR = "/Users/michael/agora/agora";

// Get current file path (works in both CJS and ESM)
function getCurrentFilePath(): string {
  try {
    // ESM: use import.meta.url
    if (typeof import.meta !== "undefined" && import.meta.url) {
      return fileURLToPath(import.meta.url);
    }
  } catch {
    // Fall through to CJS
  }
  // CJS: use __filename (available in CommonJS)
  if (typeof __filename !== "undefined") {
    return __filename;
  }
  // Fallback: use process.cwd()
  return process.cwd();
}

/**
 * Check if Prisma Client is being resolved from the correct location
 * Throws an error if Prisma is resolved from repo root
 */
export function assertPrismaResolution(): void {
  if (process.env.NODE_ENV === "production") {
    return; // Skip in production
  }

  try {
    // Use createRequire to resolve @prisma/client/package.json
    // This works in both CommonJS and ESM contexts
    const currentFile = getCurrentFilePath();
    const require = createRequire(currentFile);
    const prismaPackagePath = require.resolve("@prisma/client/package.json");
    
    // Normalize paths for comparison
    const normalizedPath = path.normalize(prismaPackagePath);
    const normalizedRepoRoot = path.normalize(REPO_ROOT);
    const normalizedAppDir = path.normalize(APP_DIR);
    
    // Check if Prisma is resolved from repo root (WRONG)
    const repoRootNodeModules = path.join(normalizedRepoRoot, "node_modules");
    if (normalizedPath.includes(repoRootNodeModules) && !normalizedPath.includes(normalizedAppDir)) {
      const errorMessage = [
        "",
        "=".repeat(70),
        "❌ PRISMA CLIENT RESOLVED FROM REPO ROOT — THIS IS INVALID",
        "=".repeat(70),
        "",
        `Prisma Client resolved from: ${prismaPackagePath}`,
        "",
        "Prisma Client must ONLY resolve from:",
        `  ${path.join(normalizedAppDir, "node_modules", "@prisma", "client")}`,
        "",
        "Fix:",
        "  1. Delete: rm -rf /Users/michael/agora/node_modules/@prisma",
        "  2. Delete: rm -rf /Users/michael/agora/node_modules/.prisma",
        "  3. Reinstall: cd agora && npm run prisma:reinstall",
        "",
        "=".repeat(70),
        "",
      ].join("\n");
      
      console.error(errorMessage);
      throw new Error("Prisma Client resolved from repo root - must resolve from /agora/node_modules");
    }
    
    // Verify it's resolved from app directory (CORRECT)
    const appNodeModules = path.join(normalizedAppDir, "node_modules");
    if (!normalizedPath.includes(appNodeModules)) {
      console.warn(
        `[PRISMA_RESOLUTION_WARNING] Prisma resolved from unexpected location: ${prismaPackagePath}`
      );
    }
  } catch (error: any) {
    // If require.resolve fails, that's also a problem
    if (error.code === "MODULE_NOT_FOUND") {
      throw new Error(
        "Prisma Client not found. Run: cd agora && npm run prisma:reinstall"
      );
    }
    // Re-throw our custom error
    if (error.message.includes("Prisma Client resolved from repo root")) {
      throw error;
    }
    // For other errors, log and continue (might be ESM/CJS interop issue)
    console.warn("[PRISMA_RESOLUTION_GUARD] Could not verify Prisma resolution:", error.message);
  }
}

/**
 * Get the resolved path of Prisma Client (for diagnostics)
 */
export function getPrismaClientPath(): string {
  try {
    const currentFile = getCurrentFilePath();
    const require = createRequire(currentFile);
    return require.resolve("@prisma/client/package.json");
  } catch (error: any) {
    return `ERROR: ${error.message}`;
  }
}
