import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifyAuthToken, getAuthCookieName } from "@/lib/jwt";
import { getPrisma } from "@/lib/db.rsc";
import type { User } from "@/lib/auth/types";

/**
 * Root route - Server-side authentication gate
 * PHASE 4: Deterministic root routing
 * 
 * TASK 3: Implement deterministic root routing:
 * - IF no valid session → /auth/sign-in
 * - IF BUYER → /buyer/agent
 * - IF SELLER and no setup (no categories/display name) → /seller/complete-profile
 * - IF SELLER and has setup → /seller/dashboard
 * 
 * IMPORTANT: "/" must NEVER route to /seller/feed
 * This logic must NOT exist anywhere else
 */
export default async function RootPage() {
  // Read auth cookie
  const cookieStore = await cookies();
  const cookieName = getAuthCookieName();
  const token = cookieStore.get(cookieName)?.value;

  // If no token, redirect to sign-in (not /login - that's just a redirect route)
  if (!token) {
    redirect("/auth/sign-in");
  }

  // Verify JWT token
  const payload = await verifyAuthToken(token);
  if (!payload) {
    // Invalid token, redirect to sign-in
    redirect("/auth/sign-in");
  }

  // Load user from database (same logic as /api/auth/me)
  const prisma = getPrisma();
  const dbUser = await prisma.user.findUnique({
    where: { id: payload.userId },
  });

  // If user doesn't exist, redirect to sign-in
  if (!dbUser) {
    redirect("/auth/sign-in");
  }

  // CRITICAL: Validate role is valid
  if (!dbUser.role || (dbUser.role !== "BUYER" && dbUser.role !== "SELLER")) {
    // Invalid role - redirect to sign-in
    redirect("/auth/sign-in");
  }

  // Build User object matching /api/auth/me format
  let categoriesServed: string[] = [];
  try {
    if (dbUser.categoriesServed) {
      categoriesServed = JSON.parse(dbUser.categoriesServed);
    }
  } catch {
    // Invalid JSON, treat as empty
  }

  const me: User = {
    id: dbUser.id,
    email: dbUser.email,
    fullName: dbUser.fullName || "",
    companyName: dbUser.companyName || "",
    role: dbUser.role,
    categoriesServed,
    serviceArea: dbUser.serviceArea || undefined,
  };

  // Deterministic redirect logic (no helpers, no guessing)
  if (!me || !me.role) {
    redirect("/auth/sign-in");
  }
  
  if (me.role === "BUYER") {
    redirect("/buyer/agent");
  }
  
  if (me.role === "SELLER") {
    // Check if seller has setup (categories or display name)
    const hasCategories = me.categoriesServed && Array.isArray(me.categoriesServed) && me.categoriesServed.length > 0;
    const hasDisplayName = !!(dbUser.companyName?.trim() || dbUser.fullName?.trim());
    const sellerHasSetup = hasCategories || hasDisplayName;
    
    if (!sellerHasSetup) {
      redirect("/seller/complete-profile");
    } else {
      redirect("/seller/dashboard");
    }
  }
  
  // Unknown role - redirect to sign-in
  redirect("/auth/sign-in");
}
