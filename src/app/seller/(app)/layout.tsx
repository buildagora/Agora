import React from "react";
import { redirect } from "next/navigation";
import { cookies, headers } from "next/headers";
import { verifyAuthToken, getAuthCookieName } from "@/lib/jwt";
import { getPrisma } from "@/lib/db.rsc";
import SellerLayoutClient from "../layout.client";

/**
 * Seller App Layout - Server component wrapper for protected routes
 * 
 * This server-side layout wraps protected seller pages under /seller/(app)/.
 * It enforces server-side authentication and role checks before rendering.
 * 
 * AUTH ENFORCEMENT:
 * - Reads auth cookie ONLY via cookies() from next/headers
 * - Verifies JWT via verifyAuthToken()
 * - Redirects to /seller/login ONLY when cookie is missing or invalid
 * - Redirects to /auth/switch-role when user is authenticated but wrong role
 * - NEVER triggers notFound(), forbidden(), or HTTPAccessError for auth failures
 * 
 * NOTE: Login pages are outside this layout (in /seller/login) and are never wrapped.
 */
export default async function SellerAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Read auth cookie directly via cookies() - canonical cookie name is "agora.auth"
  const cookieStore = await cookies();
  const cookieName = getAuthCookieName();
  const token = cookieStore.get(cookieName)?.value;
  
  // Debug log for auth guard
  const cookiePresent = !!token;
  let userId: string | null = null;
  let redirecting = false;
  
  // If no token, redirect to seller login (cookie missing or invalid)
  if (!token) {
    redirecting = true;
    if (process.env.NODE_ENV === "development") {
      console.log("[SELLER_AUTH_GUARD]", {
        cookiePresent: false,
        userId: null,
        redirecting: true,
        reason: "Cookie missing or invalid",
      });
    }
    redirect("/seller/login"); // Redirect: cookie missing or invalid
  }
  
  // Verify JWT token
  const payload = await verifyAuthToken(token);
  if (!payload) {
    redirecting = true;
    if (process.env.NODE_ENV === "development") {
      console.log("[SELLER_AUTH_GUARD]", {
        cookiePresent: true,
        userId: null,
        redirecting: true,
        reason: "JWT verification failed",
      });
    }
    redirect("/seller/login"); // Redirect: JWT verification failed
  }
  
  userId = payload.userId;
  
  // Load user from database to check role (server-side, single source of truth)
  const prisma = getPrisma();
  const dbUser = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { id: true, role: true },
  });
  
  // If user doesn't exist in DB, redirect to seller login
  if (!dbUser) {
    redirecting = true;
    if (process.env.NODE_ENV === "development") {
      console.log("[SELLER_AUTH_GUARD]", {
        cookiePresent: true,
        userId: payload.userId,
        redirecting: true,
        reason: "User not found in database",
      });
    }
    redirect("/seller/login"); // Redirect: user not found in database
  }
  
  // If user exists but is not a SELLER, redirect to switch-role (keep session intact)
  if (dbUser.role !== "SELLER") {
    redirecting = true;
    if (process.env.NODE_ENV === "development") {
      console.log("[SELLER_AUTH_GUARD]", {
        cookiePresent: true,
        userId: dbUser.id,
        redirecting: true,
        reason: `Role mismatch: expected SELLER, got ${dbUser.role}`,
      });
    }
    redirect("/auth/switch-role?target=SELLER"); // Redirect: role mismatch (session remains intact)
  }
  
  // User is authenticated and is a SELLER - render the client layout
  if (process.env.NODE_ENV === "development") {
    console.log("[SELLER_AUTH_GUARD]", {
      cookiePresent: true,
      userId: dbUser.id,
      redirecting: false,
      reason: "Authenticated SELLER - access granted",
    });
  }
  
  return <SellerLayoutClient>{children}</SellerLayoutClient>;
}

