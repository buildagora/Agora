import React from "react";
import BuyerLayoutClient from "../layout.client";

/**
 * Buyer App Layout - Server component wrapper for protected routes
 * 
 * This server-side layout wraps protected buyer pages under /buyer/(app)/.
 * It uses the client layout component for AuthGuard and BuyerShell.
 * 
 * NOTE: Login pages are outside this layout (in /buyer/login) and are never wrapped.
 */
export default function BuyerAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <BuyerLayoutClient>{children}</BuyerLayoutClient>;
}


