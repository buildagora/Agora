"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Card, { CardContent, CardHeader } from "@/components/ui2/Card";
import Button from "@/components/ui2/Button";
import Input from "@/components/ui2/Input";
import { fetchJson } from "@/lib/clientFetch";
import AgoraLogo from "@/components/brand/AgoraLogo";

function InviteSignupPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [token, setToken] = useState<string | null>(null);
  const [supplierName, setSupplierName] = useState<string>("");
  const [inviteEmail, setInviteEmail] = useState<string>("");
  const [emailHint, setEmailHint] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [formData, setFormData] = useState({
    password: "",
    confirmPassword: "",
    fullName: "",
  });

  useEffect(() => {
    const tokenParam = searchParams.get("token");
    if (tokenParam) {
      setToken(tokenParam);
      loadInvitePreview(tokenParam);
    } else {
      setError("No invite token provided");
      setLoading(false);
    }
  }, [searchParams]);

  const loadInvitePreview = async (tokenValue: string) => {
    try {
      const result = await fetchJson(`/api/seller/team/invite/preview?token=${encodeURIComponent(tokenValue)}`, {
        method: "GET",
      });

      if (!result.ok) {
        const errorMessage = result.json?.message || result.json?.error || result.text || "Failed to load invite";
        setError(errorMessage);
        return;
      }

      if (result.json?.ok) {
        setSupplierName(result.json.supplierName || "Supplier");
        setInviteEmail(result.json.email || "");
        setEmailHint(result.json.emailHint || "");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load invite");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    // Validation
    if (!formData.password || formData.password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (!token) {
      setError("No invite token provided");
      return;
    }

    setSubmitting(true);

    try {
      const result = await fetchJson("/api/auth/signup-from-invite", {
        method: "POST",
        body: JSON.stringify({
          token,
          password: formData.password,
          fullName: formData.fullName.trim() || undefined,
        }),
      });

      if (!result.ok) {
        const errorMessage = result.json?.message || result.json?.error || result.text || "Failed to create account";
        
        // If user already exists, redirect to sign-in
        if (result.status === 409) {
          const returnUrl = `/seller/team/invite?token=${encodeURIComponent(token)}`;
          router.push(`/auth/sign-in?email=${encodeURIComponent(result.json?.email || "")}&returnTo=${encodeURIComponent(returnUrl)}`);
          return;
        }

        setError(errorMessage);
        return;
      }

      // Success - redirect to sign-in with returnTo to redeem invite
      const returnUrl = `/seller/team/invite?token=${encodeURIComponent(token)}`;
      const email = result.json?.email || "";
      router.push(`/auth/sign-in?email=${encodeURIComponent(email)}&returnTo=${encodeURIComponent(returnUrl)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create account");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50">
        <div className="text-zinc-500">Loading...</div>
      </div>
    );
  }

  if (error && !token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50 px-6">
        <Card className="w-full max-w-md">
          <CardHeader>
            <AgoraLogo variant="auth" />
            <h1 className="text-2xl font-semibold text-black mt-4">
              Invalid Invitation
            </h1>
          </CardHeader>
          <CardContent>
            <p className="text-zinc-600 mb-4">{error}</p>
            <Button variant="primary" onClick={() => router.push("/")}>
              Go to Home
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 px-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <AgoraLogo variant="auth" />
          <h1 className="text-2xl font-semibold text-black mt-4">
            Join {supplierName} on Agora
          </h1>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Hidden username trap to prevent autofill from inserting admin credentials */}
            {inviteEmail && (
              <input
                type="text"
                name="username"
                autoComplete="username"
                value={inviteEmail}
                readOnly
                tabIndex={-1}
                aria-hidden="true"
                style={{ position: "absolute", left: "-9999px", width: "1px", height: "1px", opacity: 0 }}
              />
            )}

            <Input
              label="Email"
              type="email"
              name="email"
              autoComplete="email"
              value={inviteEmail}
              readOnly
              disabled
              className="bg-zinc-50 cursor-not-allowed"
            />

            <Input
              label="Full Name (Optional)"
              type="text"
              name="fullName"
              autoComplete="name"
              value={formData.fullName}
              onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
              placeholder="John Doe"
            />

            <Input
              label="Password"
              type="password"
              name="password"
              autoComplete="new-password"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              placeholder="Enter password (min 6 characters)"
              required
              disabled={submitting}
            />

            <Input
              label="Confirm Password"
              type="password"
              name="confirmPassword"
              autoComplete="new-password"
              value={formData.confirmPassword}
              onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
              placeholder="Confirm password"
              required
              disabled={submitting}
            />

            <Button
              type="submit"
              variant="primary"
              disabled={submitting || !formData.password || !formData.confirmPassword}
              className="w-full"
            >
              {submitting ? "Creating Account..." : "Create Account & Join Team"}
            </Button>
          </form>

          <p className="text-xs text-zinc-500 mt-4 text-center">
            By creating an account, you agree to the{" "}
            <a href="/legal/terms" target="_blank" className="underline">
              End User Service Agreement
            </a>
            .
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

export default function InviteSignupPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-zinc-50">
        <div className="text-zinc-500">Loading...</div>
      </div>
    }>
      <InviteSignupPageInner />
    </Suspense>
  );
}

