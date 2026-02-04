import React from "react";

/**
 * SellerRootLayout - Pass-through layout for /seller routes
 * 
 * CRITICAL: This layout NEVER enforces authentication or role checks.
 * 
 * Protected routes are under /seller/(app)/ and have their own layout with role enforcement.
 * Login routes (/seller/login) are outside (app) and are always public.
 * 
 * This prevents infinite redirect loops when accessing /seller/login.
 */
export default function SellerRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Pass-through: no auth enforcement, no redirects
  return <>{children}</>;
}
