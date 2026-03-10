"use client";

/**
 * SellerLayoutClient - Client-side layout wrapper for protected routes
 * 
 * This is the client component that wraps protected seller pages under /seller/(app)/.
 * The server-side layout (SellerAppLayout) handles ALL authentication and role enforcement.
 * 
 * NOTE: This component does NOT include AuthGuard because server-side enforcement in
 * SellerAppLayout is sufficient and prevents duplicate guards. Server-side redirects
 * happen before any client-side code runs, ensuring proper HTTP status codes (307/302).
 * 
 * NOTE: Login pages are outside this layout (in /seller/login) and are never wrapped.
 */
export default function SellerLayoutClient({ children }: { children: React.ReactNode }) {
  // Server-side auth enforcement in SellerAppLayout is the single source of truth
  // No client-side guard needed - server redirects happen before render
  return <>{children}</>;
}
