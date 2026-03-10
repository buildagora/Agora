"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/AuthProvider";
import { enforceRoleClient } from "@/lib/auth/requireRoleClient";

/**
 * Seller root page - redirects to dashboard or complete-profile
 * Canonical seller landing page is /seller/dashboard (or /seller/complete-profile if incomplete)
 */
export default function SellerPage() {
  const router = useRouter();
  const { user, status } = useAuth();

  useEffect(() => {
    if (status === "loading") return;
    if (!user) return;

    // CRITICAL: Do not route to /auth/sign-in here; preserve deep link via role-specific login + returnTo (AuthGuard invariant).
    if (!enforceRoleClient({
      userRole: user?.role || null,
      requiredRole: "SELLER",
      routerReplace: router.replace,
    })) {
      return;
    }

    // Check if seller has setup (categories or display name)
    const hasCategories = user.categoriesServed && Array.isArray(user.categoriesServed) && user.categoriesServed.length > 0;
    const hasDisplayName = !!(user.companyName?.trim() || user.fullName?.trim());
    const sellerHasSetup = hasCategories || hasDisplayName;

    if (!sellerHasSetup) {
      router.replace("/seller/complete-profile");
    } else {
      router.replace("/seller/dashboard");
    }
  }, [user, status, router]);

  // Show nothing while redirecting
  return null;
}

