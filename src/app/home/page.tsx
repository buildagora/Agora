"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/AuthProvider";
import { getDashboardRoute } from "@/lib/navigation";

export default function AuthenticatedHomePage() {
  const router = useRouter();
  const { user, status } = useAuth();

  useEffect(() => {
    // Wait for auth to load
    if (status === "loading") {
      return;
    }

    // If signed in, redirect to dashboard
    if (status === "authenticated" && user) {
      const dashboardRoute = getDashboardRoute(user);
      router.replace(dashboardRoute);
      return;
    }
    
    // If not signed in, redirect to landing page
    if (status === "unauthenticated") {
      router.replace("/");
    }
  }, [router, user, status]);

  // This page should never render - it always redirects
  return null;
}

