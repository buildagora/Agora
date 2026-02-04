import React from "react";

/**
 * BuyerRootLayout - Pass-through layout for /buyer routes
 * 
 * CRITICAL: This layout NEVER enforces authentication or role checks.
 * 
 * Protected routes are under /buyer/(app)/ and have their own layout with role enforcement.
 * Login routes (/buyer/login) are outside (app) and are always public.
 * 
 * This prevents infinite redirect loops when accessing /buyer/login.
 */
export default function BuyerRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Pass-through: no auth enforcement, no redirects
  return <>{children}</>;
}
