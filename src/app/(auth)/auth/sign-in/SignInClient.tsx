"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuth as useAuthHook } from "@/lib/auth/AuthProvider";
import { fetchJson } from "@/lib/clientFetch";
import Button from "@/components/ui2/Button";
import Card, { CardContent, CardHeader } from "@/components/ui2/Card";
import Input from "@/components/ui2/Input";
import AgoraLogo from "@/components/brand/AgoraLogo";

export default function SignInClient() {
  const searchParams = useSearchParams();
  // Use useAuth hook for session integrity check
  const authContext = useAuthHook();
  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Client-only mounted flag to prevent hydration mismatch
  const [, setMounted] = useState(false);
  const [passwordError, setPasswordError] = useState("");

  // Set mounted flag after client-side hydration
  useEffect(() => {
    setMounted(true);
  }, []);


  useEffect(() => {
    // Pre-fill email if provided in query param
    const emailParam = searchParams.get("email");
    if (emailParam) {
      setFormData((prev) => ({ ...prev, email: emailParam }));
    }
  }, [searchParams]);


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError("");
    setPasswordError("");

    // CRITICAL: Enforce single active role per session
    // If already authenticated, logout first to prevent role crossover
    const { user: currentUser, status: currentStatus } = authContext;
    if (currentStatus === "authenticated" && currentUser) {
      // DEV-ONLY: Safety assertion
      if (process.env.NODE_ENV !== "production") {
        console.warn("[SESSION_INTEGRITY] Logging out existing session before new login", {
          currentRole: currentUser.role,
          message: "Session integrity: Only one role can be active per session",
        });
      }
      
      // Import signOut and reset
      const { signOut } = await import("@/lib/auth/client");
      await signOut();
      
      // Wait for AuthProvider to reset to unauthenticated
      // Poll until status is unauthenticated (max 2 seconds)
      let attempts = 0;
      while (attempts < 20) {
        await authContext.refresh(); // Refresh to get latest state
        await new Promise(resolve => setTimeout(resolve, 100));
        if (authContext.status === "unauthenticated") {
          break;
        }
        attempts++;
      }
    }

    if (!formData.email.trim()) {
      setError("Please enter an email address");
      setIsSubmitting(false);
      return;
    }

    if (!formData.password.trim()) {
      setPasswordError("Password is required");
      setIsSubmitting(false);
      return;
    }

    // Prepare headers and body
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    const body: Record<string, string> = {
      email: formData.email.trim(),
      password: formData.password,
    };

    // Call server-side login API
    // CANONICAL ENDPOINT: POST /api/auth/login
    const loginResult = await fetchJson("/api/auth/login", {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    // Debug logging (no secrets)
    console.log("[LOGIN_DEBUG]", {
      status: loginResult.status,
      ok: loginResult.ok,
      hasJson: !!loginResult.json,
    });

    // Handle errors - show REAL server error
    if (!loginResult.ok) {
      let errorMessage: string;
      
      // Check if response is HTML (server error page)
      const isHtml = loginResult.text?.trim().startsWith("<!DOCTYPE") || 
                     loginResult.text?.trim().startsWith("<html");
      
      if (isHtml) {
        errorMessage = "Server returned non-JSON (500). Check /api/health/env and /api/health/db";
      } else if (loginResult.status === 0) {
        // Network error
        errorMessage = loginResult.text || "Network error. Please check your connection.";
      } else if (loginResult.json?.message) {
        // Server returned a message
        errorMessage = loginResult.json.message;
      } else {
        // Fallback: show text with status
        const text = loginResult.text || "Unknown error";
        errorMessage = `${text.slice(0, 300)} (${loginResult.status})`;
      }
      
      setError(errorMessage);
      setIsSubmitting(false);
      return;
    }

    // Validate response structure - MUST have ok: true and user
    if (!loginResult.json || loginResult.json.ok !== true || !loginResult.json.user) {
      console.error("[LOGIN_ERROR] Invalid response structure", loginResult.json);
      setError("Invalid response from server. Please try again.");
      setIsSubmitting(false);
      return;
    }

    // Server is source of truth - use the user returned by /api/auth/login
    const userData = loginResult.json.user;
    
    // Normalize user data (handles both legacy `role` and new `activeRole`/`roles` formats)
    const { normalizeAuthUser } = await import("@/lib/auth/normalizeUser");
    const normalizedUser = normalizeAuthUser(userData);
    
    if (!normalizedUser) {
      console.error("[LOGIN_ERROR] User data missing required fields or invalid format", userData);
      setError("Invalid user data from server. Please try again.");
      setIsSubmitting(false);
      return;
    }
    
    // Use normalized user for downstream logic
    const userDataForRouting = normalizedUser;

    // TASK 3: Perform HARD RELOAD after successful login
    // DO NOT call setUser, refresh, or router.push
    // Use window.location.replace() for full page reload (prevents back button from returning to sign-in)
    
    // Import route intent helpers
    const { validateReturnTo, getDashboardForRole, sanitizeReturnTo } = await import("@/lib/auth/routeIntent");
    
    // Helper function for default dashboard routing
    function getDefaultDashboardPath(user: typeof userDataForRouting): string {
      return getDashboardForRole(
        user.role,
        user.role === "SELLER" ? {
          categoriesServed: user.categoriesServed,
          companyName: user.companyName,
          fullName: user.fullName,
        } : undefined
      );
    }
    
    // Check for 'returnTo' parameter (preferred) or 'next' parameter (legacy)
    const returnToParam = searchParams.get("returnTo") || searchParams.get("next");
    let redirectPath: string;
    
    // If 'returnTo' parameter exists, validate and use it
    if (returnToParam) {
      try {
        const decodedReturnTo = decodeURIComponent(returnToParam);
        
        // CRITICAL: Sanitize returnTo first to strip nested recursion and reject auth pages
        const sanitized = sanitizeReturnTo(decodedReturnTo);
        
        // Validate returnTo path for safety and role match (after sanitization)
        if (sanitized && validateReturnTo(sanitized, userDataForRouting.role)) {
          redirectPath = sanitized;
        } else {
          // ReturnTo path doesn't match role or is unsafe - fall back to default dashboard
          redirectPath = getDefaultDashboardPath(userDataForRouting);
        }
      } catch {
        // Invalid returnTo parameter - fall back to default dashboard
        redirectPath = getDefaultDashboardPath(userDataForRouting);
      }
    } else {
      // No returnTo parameter - use default dashboard logic
      redirectPath = getDefaultDashboardPath(userDataForRouting);
    }
    
    // Debug log to diagnose redirect issues (dev only)
    if (process.env.NODE_ENV !== "production") {
      console.log("[SIGN_IN_REDIRECT]", {
        userId: userDataForRouting.id,
        role: userDataForRouting.role,
        email: userDataForRouting.email,
        returnToParam,
        redirectPath,
      });
    }
    
    // TASK 3: Hard reload - guarantees cookie is written, app reloads, AuthProvider rehydrates
    // Use replace() instead of href to prevent browser back button from returning to sign-in page
    window.location.replace(redirectPath);
  };

  return (
      <div className="flex flex-1 items-center justify-center px-6 py-16">
        <div className="w-full max-w-md">
          <Card>
          <CardHeader>
            <div className="text-center mb-4">
              <div className="flex items-center justify-center mb-2">
                <AgoraLogo variant="auth" />
              </div>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Your Digital Sales Representative
              </p>
            </div>
            <h2 className="text-xl font-semibold text-black dark:text-zinc-50 text-center">
              Sign In
            </h2>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="flex flex-col gap-6">
              {error && (
                <div className="p-4 border border-red-300 dark:border-red-700 rounded-lg bg-red-50 dark:bg-red-900/20">
                  <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-black dark:text-zinc-50 mb-2">
                  Email
                </label>
                <Input
                  type="email"
                  value={formData.email}
                  onChange={(e) => {
                    setFormData((prev) => ({ ...prev, email: e.target.value }));
                    setError("");
                  }}
                  placeholder="Enter your email"
                  required
                  autoComplete="email"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-black dark:text-zinc-50 mb-2">
                  Password
                </label>
                <Input
                  type="password"
                  value={formData.password}
                  onChange={(e) => {
                    setFormData((prev) => ({ ...prev, password: e.target.value }));
                    setPasswordError("");
                    setError("");
                  }}
                  placeholder="Enter your password"
                  required
                  autoComplete="current-password"
                  error={passwordError}
                />
              </div>

              <Button
                type="submit"
                variant="primary"
                size="lg"
                disabled={isSubmitting}
                className="w-full"
              >
                {isSubmitting ? "Signing In..." : "Sign In"}
              </Button>
            </form>

            <div className="mt-6 text-center">
              <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-2">
                Don&apos;t have an account?{" "}
                <Link
                  href="/auth/sign-up"
                  className="text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 font-medium transition-colors"
                >
                  Create account
                </Link>
              </p>
            </div>

          </CardContent>
          </Card>
        </div>
      </div>
    );
}

