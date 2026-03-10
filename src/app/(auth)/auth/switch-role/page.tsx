"use client";

import { Suspense, useEffect, useState, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth/AuthProvider";
import { signOut } from "@/lib/auth/client";
import { getDashboardForRole, sanitizeReturnTo } from "@/lib/auth/routeIntent";
import type { UserRole } from "@/lib/auth/types";
import Button from "@/components/ui2/Button";
import Card, { CardContent, CardHeader } from "@/components/ui2/Card";
import AgoraLogo from "@/components/brand/AgoraLogo";

/**
 * Switch Role Page
 * 
 * Shown when a user tries to access a route that requires a different role.
 * Preserves the current session until the user explicitly chooses to switch.
 */
function SwitchRolePageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, status } = useAuth();
  const [isSwitching, setIsSwitching] = useState(false);

  // Get role query param - accept both "role" (legacy) and "target" (AuthGuard standard)
  const roleParam = searchParams.get("target") || searchParams.get("role");
  
  // Normalize target role: accept "seller" | "SELLER" => "SELLER", "buyer" | "BUYER" => "BUYER"
  const normalizedTargetRole: UserRole | null = useMemo(() => {
    if (!roleParam) return null;
    const upper = roleParam.toUpperCase();
    if (upper === "SELLER" || upper === "BUYER") {
      return upper as UserRole;
    }
    return null;
  }, [roleParam]);

  // Get and sanitize returnTo
  const rawReturnTo = searchParams.get("returnTo");
  const sanitizedReturnTo = useMemo(() => {
    const sanitized = sanitizeReturnTo(rawReturnTo);
    return sanitized || undefined; // Convert empty string to undefined
  }, [rawReturnTo]);

  // Compute nextPath based on current state
  const computedNextPath = useMemo(() => {
    // If loading, don't navigate
    if (status === "loading") {
      return null;
    }

    // If not authenticated: always redirect to /auth/sign-in with role + returnTo preserved
    if (status === "unauthenticated" || !user) {
      if (normalizedTargetRole) {
        const params = new URLSearchParams();
        params.set("role", normalizedTargetRole.toLowerCase());
        if (sanitizedReturnTo) {
          params.set("returnTo", sanitizedReturnTo);
        }
        return `/auth/sign-in?${params.toString()}`;
      }
      return "/auth/sign-in";
    }

    // If authenticated
    // If targetRole is invalid/null: redirect to dashboard
    if (!normalizedTargetRole) {
      if (!user.activeRole) {
        throw new Error("User activeRole is missing");
      }
      return getDashboardForRole(
        user.activeRole,
        user.activeRole === "SELLER" ? {
          categoriesServed: user.categoriesServed,
          companyName: user.companyName,
          fullName: user.fullName,
        } : undefined
      );
    }

    // If user.activeRole === targetRole: redirect to returnTo or dashboard
    if (user.activeRole === normalizedTargetRole) {
      if (sanitizedReturnTo) {
        return sanitizedReturnTo;
      }
      if (!user.activeRole) {
        throw new Error("User activeRole is missing");
      }
      return getDashboardForRole(
        user.activeRole,
        user.activeRole === "SELLER" ? {
          categoriesServed: user.categoriesServed,
          companyName: user.companyName,
          fullName: user.fullName,
        } : undefined
      );
    }

    // If user.activeRole !== targetRole: return null to show role mismatch UI (no auto-redirect)
    return null;
  }, [status, user, normalizedTargetRole, sanitizedReturnTo]);

  // Handle navigation in useEffect
  useEffect(() => {
    if (!computedNextPath) return;
    router.replace(computedNextPath);
  }, [computedNextPath, router]);

  // Loading UI
  const LoadingUI = () => (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
        <p className="mt-4 text-gray-600">Loading...</p>
      </div>
    </div>
  );

  // Wait for auth to load
  if (status === "loading") {
    return <LoadingUI />;
  }

  // If redirecting, render null (never render while redirecting)
  if (computedNextPath) {
    return null;
  }

  // Only render interactive UI when:
  // - user is authenticated
  // - targetRole exists
  // - user.activeRole !== targetRole
  if (!user || !normalizedTargetRole || user.activeRole === normalizedTargetRole) {
    return null;
  }

  const handleContinue = () => {
    // Redirect to dashboard for current role
    if (!user.activeRole) {
      throw new Error("User activeRole is missing");
    }
    const dashboardPath = getDashboardForRole(
      user.activeRole,
      user.activeRole === "SELLER" ? {
        categoriesServed: user.categoriesServed,
        companyName: user.companyName,
        fullName: user.fullName,
      } : undefined
    );
    router.replace(dashboardPath);
  };

  const handleSwitch = async () => {
    if (!normalizedTargetRole) {
      return; // Should not happen due to validation above
    }

    setIsSwitching(true);
    
    try {
      // Call server API to switch role (updates JWT with new activeRole)
      const response = await fetch("/api/auth/switch-role", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ targetRole: normalizedTargetRole }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to switch role");
      }

      const data = await response.json();
      
      // Role switch successful - redirect to returnTo or dashboard
      if (sanitizedReturnTo) {
        router.replace(sanitizedReturnTo);
      } else {
        // Redirect to dashboard for the new role
        const dashboardPath = getDashboardForRole(
          normalizedTargetRole,
          normalizedTargetRole === "SELLER" ? {
            categoriesServed: user.categoriesServed,
            companyName: user.companyName,
            fullName: user.fullName,
          } : undefined
        );
        router.replace(dashboardPath);
      }
    } catch (error) {
      console.error("[SWITCH_ROLE_ERROR]", error);
      setIsSwitching(false);
      // On error, still try to redirect (user may need to re-login)
      const params = new URLSearchParams();
      params.set("role", normalizedTargetRole.toLowerCase());
      if (sanitizedReturnTo) {
        params.set("returnTo", sanitizedReturnTo);
      }
      const loginPath = `/auth/sign-in?${params.toString()}`;
      router.replace(loginPath);
    }
  };

  const currentRoleLabel = user.activeRole === "BUYER" ? "Buyer" : "Seller";
  const targetRoleLabel = normalizedTargetRole === "BUYER" ? "Buyer" : "Seller";

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <AgoraLogo className="mx-auto h-12 w-auto" />
          <h2 className="mt-6 text-3xl font-extrabold text-gray-900">
            Account Role Mismatch
          </h2>
        </div>

        <Card>
          <CardHeader>
            <h3 className="text-lg font-medium text-gray-900">
              Role Required
            </h3>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-sm text-gray-600">
              <p className="mb-2">
                You are currently signed in as <strong>{currentRoleLabel}</strong>.
              </p>
              <p>
                This page requires a <strong>{targetRoleLabel}</strong> account.
              </p>
            </div>

            <div className="flex flex-col gap-3 pt-4">
              <Button
                onClick={handleContinue}
                variant="outline"
                className="w-full"
              >
                Continue as {currentRoleLabel}
              </Button>

              <Button
                onClick={handleSwitch}
                disabled={isSwitching}
                className="w-full"
              >
                {isSwitching ? "Switching..." : `Switch to ${targetRoleLabel}`}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function SwitchRolePage() {
  return (
    <Suspense fallback={null}>
      <SwitchRolePageInner />
    </Suspense>
  );
}
