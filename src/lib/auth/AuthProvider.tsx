"use client";

/**
 * AuthProvider - Client-side authentication context provider
 * PHASE 4: Uses /api/auth/me as the ONLY source of truth
 * 
 * Server (cookie + JWT + DB) is the single source of truth.
 * This provider fetches user data from /api/auth/me and provides it via React Context.
 * NO storage, NO role inference, NO caching beyond React state.
 * 
 * TASK 2: AuthProvider is PASSIVE on /auth/* routes - does NOT call /api/auth/me
 */

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { usePathname } from "next/navigation";
import type { User } from "./types";

type AuthStatus = "loading" | "authenticated" | "unauthenticated";

interface AuthContextValue {
  user: User | null;
  status: AuthStatus;
  refresh: () => Promise<void>;
  reset: () => void; // Immediate reset for logout
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/**
 * AuthProvider - Provides authentication state to the app
 * Fetches user from /api/auth/me (server is source of truth)
 * TASK 2: Does NOT call /api/auth/me on /auth/* routes
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<AuthStatus>("loading");

  /**
   * Immediate reset function for logout
   * Resets state to unauthenticated without waiting for server
   */
  const reset = useCallback(() => {
    setUser(null);
    setStatus("unauthenticated");
  }, []);

  /**
   * Fetch user from /api/auth/me
   * Server is the single source of truth - no cache, no storage
   * TASK 1: Uses cache:"no-store" and credentials:"include"
   */
  const fetchUser = useCallback(async () => {
    try {
      // TASK 1: Fetch ONLY GET /api/auth/me with cache:"no-store" and credentials:"include"
      const response = await fetch("/api/auth/me", {
        method: "GET",
        cache: "no-store",
        credentials: "include",
      });

      if (!response.ok) {
        setUser(null);
        setStatus("unauthenticated");
        return;
      }

      const data = await response.json();

      // TASK 1: Has exactly 3 states: loading, authenticated, unauthenticated
      if (data.ok && data.user) {
        const fetchedUser = data.user as User;
        
        // TASK 1: NEVER infers role - uses only user.role from /api/auth/me
        // Validate role is valid (BUYER or SELLER)
        if (!fetchedUser.role || (fetchedUser.role !== "BUYER" && fetchedUser.role !== "SELLER")) {
          setUser(null);
          setStatus("unauthenticated");
          return;
        }
        
        setUser(fetchedUser);
        setStatus("authenticated");
      } else {
        // ok:false or no user - explicitly unauthenticated
        setUser(null);
        setStatus("unauthenticated");
      }
    } catch (error) {
      // Network error or server error - treat as unauthenticated
      setUser(null);
      setStatus("unauthenticated");
    }
  }, []);

  // Fetch user on mount
  // TASK 2: Do NOT call /api/auth/me on /auth/* routes
  useEffect(() => {
    const isAuthRoute = pathname?.startsWith("/auth");
    
    if (isAuthRoute) {
      // On auth routes, immediately set unauthenticated and return early
      setUser(null);
      setStatus("unauthenticated");
      return;
    }
    
    // Only call /api/auth/me when NOT on auth routes
    fetchUser();
  }, [fetchUser, pathname]);

  // Listen for logout events to reset state immediately
  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleLogout = () => {
      reset();
    };

    window.addEventListener("auth:logout", handleLogout);
    return () => {
      window.removeEventListener("auth:logout", handleLogout);
    };
  }, [reset]);

  // TASK 1: Log state changes (dev only)
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" && typeof window !== "undefined") {
      const pathname = window.location.pathname;
      console.log("[AUTH_PROVIDER_STATE]", {
        path: pathname,
        status,
        role: user?.role || null,
        userId: user?.id || null,
      });
    }
  }, [user, status]);

  // Refresh function for manual refresh (e.g., after login)
  // TASK 2: Do NOT call /api/auth/me on /auth/* routes
  const refresh = useCallback(async () => {
    const isAuthRoute = pathname?.startsWith("/auth");
    
    if (isAuthRoute) {
      // On auth routes, immediately set unauthenticated and return early
      setUser(null);
      setStatus("unauthenticated");
      return;
    }
    
    await fetchUser();
  }, [fetchUser, pathname]);

  const value: AuthContextValue = {
    user,
    status,
    refresh,
    reset,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * useAuth - Hook to access authentication state
 */
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
