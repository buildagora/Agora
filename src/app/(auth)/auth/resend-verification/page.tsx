"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function ResendVerificationPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setStatus("idle");
    setMessage("");

    try {
      const res = await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();

      if (res.ok && data.ok) {
        setStatus("success");
        setMessage(data.message || "If an account exists and is unverified, a verification email has been sent.");
      } else {
        setStatus("error");
        setMessage(data.message || "Failed to send verification email.");
      }
    } catch (error) {
      console.error("[RESEND_VERIFICATION_ERROR]", error);
      setStatus("error");
      setMessage("An error occurred. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-md">
        <div className="bg-white border border-zinc-200 rounded-lg p-8 shadow-sm">
          <h1 className="text-2xl font-semibold text-black mb-2 text-center">
            Resend Verification Email
          </h1>
          <p className="text-sm text-zinc-600 mb-8 text-center">
            Enter your email address and we'll send you a new verification link.
          </p>

          {status === "success" && (
            <div className="mb-6 p-4 border border-green-300 rounded-lg bg-green-50">
              <p className="text-sm text-green-600 text-center">
                {message}
              </p>
            </div>
          )}

          {status === "error" && (
            <div className="mb-6 p-4 border border-red-300 rounded-lg bg-red-50">
              <p className="text-sm text-red-600 text-center">
                {message}
              </p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="mb-6">
            <div className="mb-4">
              <label className="block text-sm font-medium text-black mb-2">
                Email address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setStatus("idle");
                  setMessage("");
                }}
                placeholder="Enter your email"
                className="w-full px-4 py-3 border border-zinc-300 rounded-lg bg-white text-black focus:outline-none focus:ring-2 focus:ring-black"
                required
                autoComplete="email"
                disabled={isSubmitting}
              />
            </div>
            <button
              type="submit"
              disabled={isSubmitting || !email.trim()}
              className="w-full h-12 rounded-lg bg-black text-white transition-colors hover:bg-zinc-800 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? "Sending..." : "Send Verification Email"}
            </button>
          </form>

          <div className="text-center">
            <Link
              href="/auth/sign-in"
              className="text-sm text-zinc-600 hover:text-zinc-900 transition-colors"
            >
              Back to Sign In
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}



