"use client";

import AuthGuard from "@/lib/authGuard";

/**
 * SellerLayoutClient - Client-side layout wrapper for protected routes
 * 
 * This is the client component that wraps protected seller pages under /seller/(app)/.
 * The server-side layout handles role enforcement and redirects.
 * This client component provides the AuthGuard as a fallback.
 * 
 * NOTE: Login pages are outside this layout (in /seller/login) and are never wrapped.
 */
export default function SellerLayoutClient({ children }: { children: React.ReactNode }) {
  // AuthGuard with requiredRole enforces SELLER-only access as a fallback
  // The server-side layout should have already handled redirects, but this
  // provides client-side protection in case of edge cases
  return <AuthGuard requiredRole="SELLER">{children}</AuthGuard>;
}
