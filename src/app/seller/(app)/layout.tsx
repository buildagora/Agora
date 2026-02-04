import React from "react";
import SellerLayoutClient from "../layout.client";

/**
 * Seller App Layout - Server component wrapper for protected routes
 * 
 * This server-side layout wraps protected seller pages under /seller/(app)/.
 * It uses the client layout component for AuthGuard.
 * 
 * NOTE: Login pages are outside this layout (in /seller/login) and are never wrapped.
 */
export default function SellerAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <SellerLayoutClient>{children}</SellerLayoutClient>;
}

