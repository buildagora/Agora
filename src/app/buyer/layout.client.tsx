"use client";

import AuthGuard from "@/lib/authGuard";
import BuyerShell from "@/components/buyer/BuyerShell";

/**
 * BuyerLayoutClient - Client-side layout wrapper for protected routes
 * 
 * This is the client component that wraps protected buyer pages under /buyer/(app)/.
 * The server-side layout handles role enforcement and redirects.
 * This client component provides the AuthGuard and BuyerShell as fallbacks.
 * 
 * NOTE: Login pages are outside this layout (in /buyer/login) and are never wrapped.
 */
export default function BuyerLayoutClient({ children }: { children: React.ReactNode }) {
  // AuthGuard with requiredRole enforces BUYER-only access as a fallback
  // The server-side layout should have already handled redirects, but this
  // provides client-side protection in case of edge cases
  return (
    <AuthGuard requiredRole="BUYER">
      <BuyerShell>{children}</BuyerShell>
    </AuthGuard>
  );
}
