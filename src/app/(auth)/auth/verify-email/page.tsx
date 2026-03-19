"use client";

import { Suspense, useEffect, useState, useRef } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

function VerifyEmailPageInner() {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<"loading" | "success" | "error" | "expired" | "invalid">("loading");
  const [message, setMessage] = useState<string>("");
  
  // CRITICAL: Use ref to prevent duplicate verification calls
  // This guards against React Strict Mode double invocation and re-renders
  const verificationAttempted = useRef(false);
  const tokenRef = useRef<string | null>(null);

  useEffect(() => {
    // Extract token once and store in ref for stability
    const token = searchParams.get("token");
    
    // Dev-only logging
    if (process.env.NODE_ENV === "development") {
      console.log("[VERIFY_EMAIL_PAGE]", {
        tokenDetected: !!token,
        tokenLength: token?.length || 0,
        verificationAttempted: verificationAttempted.current,
      });
    }

    // Guard: Don't verify if already attempted or no token
    if (verificationAttempted.current) {
      if (process.env.NODE_ENV === "development") {
        console.log("[VERIFY_EMAIL_PAGE]", "Skipping duplicate verification attempt");
      }
      return;
    }

    if (!token || !token.trim()) {
      setStatus("invalid");
      setMessage("Verification token is missing");
      return;
    }

    // Store token in ref and mark as attempted
    tokenRef.current = token;
    verificationAttempted.current = true;

    // Dev-only logging
    if (process.env.NODE_ENV === "development") {
      console.log("[VERIFY_EMAIL_PAGE]", "Starting verification request");
    }

    // Call verification API
    fetch(`/api/auth/verify-email?token=${encodeURIComponent(token.trim())}`, {
      method: "GET",
      credentials: "include",
      cache: "no-store",
    })
      .then(async (res) => {
        const data = await res.json();
        
        if (process.env.NODE_ENV === "development") {
          console.log("[VERIFY_EMAIL_PAGE]", {
            status: res.status,
            ok: res.ok,
            dataOk: data.ok,
            error: data.error,
            alreadyVerified: data.alreadyVerified,
          });
        }

        if (res.ok && data.ok) {
          if (data.alreadyVerified) {
            setStatus("success");
            setMessage("Your email is already verified. You can sign in now.");
          } else {
            setStatus("success");
            setMessage("Your email has been verified. You can now sign in.");
          }
        } else {
          // Handle different error types
          if (data.error === "EXPIRED_TOKEN") {
            setStatus("expired");
            setMessage(data.message || "This verification link has expired.");
          } else if (data.error === "INVALID_TOKEN" || data.error === "MISSING_TOKEN") {
            setStatus("invalid");
            setMessage(data.message || "This verification link is invalid.");
          } else {
            setStatus("error");
            setMessage(data.message || "We couldn't verify your email right now.");
          }
        }
      })
      .catch((error) => {
        console.error("[VERIFY_EMAIL_ERROR]", error);
        setStatus("error");
        setMessage("We couldn't verify your email right now.");
        
        if (process.env.NODE_ENV === "development") {
          console.log("[VERIFY_EMAIL_PAGE]", "Verification request failed", error);
        }
      });
  }, [searchParams]); // Keep searchParams as dependency but guard with ref

  return (
    <div className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-md">
        <div className="bg-white border border-zinc-200 rounded-lg p-8 shadow-sm">
          <h1 className="text-2xl font-semibold text-black mb-2 text-center">
            {status === "loading" && "Verifying your email..."}
            {status === "success" && "Email Verified"}
            {status === "expired" && "Verification Expired"}
            {status === "invalid" && "Invalid Token"}
            {status === "error" && "Verification Error"}
          </h1>

          {status === "loading" && (
            <div className="mt-8 text-center">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-black"></div>
              <p className="mt-4 text-sm text-zinc-600">
                Please wait while we verify your email address...
              </p>
            </div>
          )}

          {status === "success" && (
            <div className="mt-8">
              <div className="mb-6 p-4 border border-green-300 rounded-lg bg-green-50">
                <p className="text-sm text-green-600 text-center">
                  {message}
                </p>
              </div>
              <div className="text-center">
                <Link
                  href="/auth/sign-in"
                  className="inline-block w-full px-4 py-3 rounded-lg bg-black text-white transition-colors hover:bg-zinc-800 font-medium"
                >
                  Sign In
                </Link>
              </div>
            </div>
          )}

          {(status === "expired" || status === "invalid") && (
            <div className="mt-8">
              <div className="mb-6 p-4 border border-red-300 rounded-lg bg-red-50">
                <p className="text-sm text-red-600 text-center">
                  {message}
                </p>
              </div>
              <div className="text-center space-y-3">
                <Link
                  href="/auth/resend-verification"
                  className="inline-block w-full px-4 py-3 rounded-lg bg-black text-white transition-colors hover:bg-zinc-800 font-medium"
                >
                  Request New Verification Email
                </Link>
                <Link
                  href="/auth/sign-in"
                  className="block text-sm text-zinc-600 hover:text-zinc-900 transition-colors"
                >
                  Back to Sign In
                </Link>
              </div>
            </div>
          )}

          {status === "error" && (
            <div className="mt-8">
              <div className="mb-6 p-4 border border-red-300 rounded-lg bg-red-50">
                <p className="text-sm text-red-600 text-center">
                  {message}
                </p>
              </div>
              <div className="text-center space-y-3">
                <button
                  onClick={() => {
                    // Reset state and retry verification
                    verificationAttempted.current = false;
                    setStatus("loading");
                    setMessage("");
                    
                    const token = tokenRef.current || searchParams.get("token");
                    if (token) {
                      verificationAttempted.current = true;
                      
                      if (process.env.NODE_ENV === "development") {
                        console.log("[VERIFY_EMAIL_PAGE]", "Retrying verification request");
                      }
                      
                      fetch(`/api/auth/verify-email?token=${encodeURIComponent(token.trim())}`, {
                        method: "GET",
                        credentials: "include",
                        cache: "no-store",
                      })
                        .then(async (res) => {
                          const data = await res.json();
                          if (res.ok && data.ok) {
                            if (data.alreadyVerified) {
                              setStatus("success");
                              setMessage("Your email is already verified. You can sign in now.");
                            } else {
                              setStatus("success");
                              setMessage("Your email has been verified. You can now sign in.");
                            }
                          } else {
                            if (data.error === "EXPIRED_TOKEN") {
                              setStatus("expired");
                              setMessage(data.message || "This verification link has expired.");
                            } else if (data.error === "INVALID_TOKEN" || data.error === "MISSING_TOKEN") {
                              setStatus("invalid");
                              setMessage(data.message || "This verification link is invalid.");
                            } else {
                              setStatus("error");
                              setMessage(data.message || "We couldn't verify your email right now.");
                            }
                          }
                        })
                        .catch((error) => {
                          console.error("[VERIFY_EMAIL_RETRY_ERROR]", error);
                          setStatus("error");
                          setMessage("We couldn't verify your email right now.");
                        });
                    }
                  }}
                  className="w-full px-4 py-3 rounded-lg bg-black text-white transition-colors hover:bg-zinc-800 font-medium"
                >
                  Try Again
                </button>
                <Link
                  href="/auth/sign-in"
                  className="block text-sm text-zinc-600 hover:text-zinc-900 transition-colors"
                >
                  Back to Sign In
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={
      <div className="flex flex-1 items-center justify-center px-6 py-16">
        <div className="w-full max-w-md">
          <div className="bg-white border border-zinc-200 rounded-lg p-8 shadow-sm">
            <h1 className="text-2xl font-semibold text-black mb-2 text-center">
              Verifying your email...
            </h1>
            <div className="mt-8 text-center">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-black"></div>
            </div>
          </div>
        </div>
      </div>
    }>
      <VerifyEmailPageInner />
    </Suspense>
  );
}

