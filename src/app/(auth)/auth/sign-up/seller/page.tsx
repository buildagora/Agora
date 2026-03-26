"use client";

import { Suspense, useState, useEffect, startTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { MATERIAL_CATEGORIES } from "@/lib/categoryDisplay";
import { labelToCategoryId, type CategoryLabel } from "@/lib/categoryIds";
import { validateEmailOrTestId, getEmailLabel, getEmailPlaceholder } from "@/lib/validators";
import AppShell from "@/components/ui2/AppShell";
import Button from "@/components/ui2/Button";
import Card, { CardContent, CardHeader } from "@/components/ui2/Card";
import Input from "@/components/ui2/Input";

interface SupplierPreview {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  category: string | null;
}

function SellerSignUpPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supplierId = searchParams.get("supplier");

  const [supplierPreview, setSupplierPreview] = useState<SupplierPreview | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const [formData, setFormData] = useState(() => ({
    companyName: "",
    fullName: "",
    email: searchParams.get("email") ?? "",
    phone: "",
    password: searchParams.get("password") ?? "",
    agreedToTerms: false,
  }));
  const [categoriesServed, setCategoriesServed] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!supplierId) {
      return;
    }

    startTransition(() => {
      setLoadingPreview(true);
      setPreviewError(null);
    });

    fetch(`/api/seller/supplier-preview?supplierId=${encodeURIComponent(supplierId)}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.ok && data.supplier) {
          setSupplierPreview(data.supplier);
          setFormData((prev) => ({
            ...prev,
            companyName: data.supplier.name || "",
            email: data.supplier.email || prev.email,
            phone: data.supplier.phone || "",
          }));
          if (data.supplier.category) {
            const raw = String(data.supplier.category).trim().toLowerCase();
            const match = (Object.values(labelToCategoryId) as string[]).find(
              (id) => id.toLowerCase() === raw
            );
            if (match) {
              setCategoriesServed((prev) => (prev.includes(match) ? prev : [...prev, match]));
            }
          }
        } else {
          setPreviewError(data.message || "Supplier not found. Please check your signup link.");
        }
      })
      .catch(() => {
        setPreviewError("Failed to load supplier information. Please try again.");
      })
      .finally(() => {
        setLoadingPreview(false);
      });
  }, [supplierId]);

  const handleChange = (field: string, value: string | boolean) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  const handleCategoryToggle = (categoryLabel: CategoryLabel) => {
    const categoryId = labelToCategoryId[categoryLabel];
    if (!categoryId) return;
    setCategoriesServed((prev) =>
      prev.includes(categoryId) ? prev.filter((id) => id !== categoryId) : [...prev, categoryId]
    );
    if (errors.categories) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next.categories;
        return next;
      });
    }
  };

  const claimBlocked =
    Boolean(supplierId) &&
    (loadingPreview || Boolean(previewError && !supplierPreview));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    if (!formData.companyName.trim() && !formData.fullName.trim()) {
      setErrors({ companyName: "Company name or full name is required" });
      return;
    }

    if (!formData.email.trim()) {
      setErrors({ email: "Email is required" });
      return;
    }
    const emailValidation = validateEmailOrTestId(formData.email);
    if (!emailValidation.ok) {
      setErrors({ email: emailValidation.message || "Invalid email or test ID" });
      return;
    }

    if (!formData.phone.trim()) {
      setErrors({ phone: "Phone is required" });
      return;
    }

    if (!formData.password || formData.password.length < 8) {
      setErrors({ password: "Password must be at least 8 characters" });
      return;
    }

    if (categoriesServed.length === 0) {
      setErrors({ categories: "Please select at least one category" });
      return;
    }

    if (!formData.agreedToTerms) {
      setErrors({ agreedToTerms: "You must agree to the End User Service Agreement" });
      return;
    }

    setIsSubmitting(true);

    try {
      const payload: Record<string, unknown> = {
        email: formData.email.trim().toLowerCase(),
        password: formData.password,
        role: "SELLER",
        categoryIds: categoriesServed,
        categoriesServed,
        agreedToTerms: true,
      };

      if (formData.companyName.trim()) payload.companyName = formData.companyName.trim();
      if (formData.fullName.trim()) payload.fullName = formData.fullName.trim();
      payload.phone = formData.phone.trim();

      if (supplierId) {
        payload.supplierId = supplierId;
      }

      const response = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      const rawText = await response.text();
      let parsed: { ok?: boolean; message?: string; error?: string; user?: unknown; storedEmail?: string } | null =
        null;
      try {
        parsed = rawText ? JSON.parse(rawText) : null;
      } catch {
        parsed = null;
      }

      if (!response.ok) {
        const errorMessage =
          parsed?.message || parsed?.error || `Signup failed (${response.status})`;
        setErrors({ submit: errorMessage });
        setIsSubmitting(false);
        return;
      }

      if (!parsed || parsed.ok !== true || !parsed.user) {
        setErrors({ submit: parsed?.message || "Signup failed" });
        setIsSubmitting(false);
        return;
      }

      if (parsed.storedEmail && parsed.storedEmail !== formData.email.trim().toLowerCase()) {
        alert(
          `Account created!\n\nStored email: ${parsed.storedEmail}\n\nCopy this email to sign in.`
        );
      }

      const emailQ = encodeURIComponent(formData.email.trim().toLowerCase());
      let signInUrl = `/auth/sign-in?email=${emailQ}`;
      const returnTo = searchParams.get("returnTo");
      if (returnTo) {
        signInUrl += `&returnTo=${encodeURIComponent(returnTo)}`;
      }
      router.push(signInUrl);
    } catch {
      setErrors({ submit: "Failed to create account. Please try again." });
      setIsSubmitting(false);
    }
  };

  return (
    <AppShell role={undefined}>
      <div className="flex flex-1 items-center justify-center px-6 py-16">
        <div className="w-full max-w-2xl">
          <Card>
            <CardHeader>
              <h1 className="text-2xl font-semibold text-black text-center">
                {supplierId ? "Claim supplier account" : "Create seller account"}
              </h1>
              {supplierId && (
                <p className="text-sm text-zinc-600 text-center mt-2">
                  Link your account to this supplier organization.
                </p>
              )}
            </CardHeader>
            <CardContent>
              {supplierId && (
                <div className="mb-6 space-y-3">
                  {loadingPreview && (
                    <p className="text-sm text-zinc-600">Loading supplier information…</p>
                  )}
                  {previewError && (
                    <div className="p-4 border border-red-200 rounded-lg bg-red-50">
                      <p className="text-sm text-red-700">{previewError}</p>
                    </div>
                  )}
                  {supplierPreview && !previewError && (
                    <div className="p-4 border border-zinc-200 rounded-lg bg-zinc-50">
                      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 mb-1">
                        Claiming supplier
                      </p>
                      <p className="text-sm font-semibold text-black">{supplierPreview.name}</p>
                    </div>
                  )}
                </div>
              )}

              <form onSubmit={handleSubmit} className="flex flex-col gap-6">
                <div>
                  <h2 className="text-lg font-semibold text-black mb-4">Account information</h2>
                  <div className="space-y-4">
                    <Input
                      label="Company name *"
                      type="text"
                      value={formData.companyName}
                      onChange={(e) => handleChange("companyName", e.target.value)}
                      error={errors.companyName}
                      disabled={claimBlocked}
                    />
                    <Input
                      label="Full name (if no company name)"
                      type="text"
                      value={formData.fullName}
                      onChange={(e) => handleChange("fullName", e.target.value)}
                      error={errors.fullName}
                      disabled={claimBlocked}
                    />
                  </div>
                </div>

                <div>
                  <h2 className="text-lg font-semibold text-black mb-4">Contact</h2>
                  <div className="space-y-4">
                    <Input
                      label={`${getEmailLabel()} *`}
                      type={process.env.NODE_ENV === "production" ? "email" : "text"}
                      value={formData.email}
                      onChange={(e) => handleChange("email", e.target.value)}
                      placeholder={getEmailPlaceholder()}
                      error={errors.email}
                      disabled={claimBlocked || Boolean(supplierPreview?.email)}
                      autoComplete="email"
                    />
                    <Input
                      label="Phone *"
                      type="tel"
                      value={formData.phone}
                      onChange={(e) => handleChange("phone", e.target.value)}
                      error={errors.phone}
                      disabled={claimBlocked}
                      autoComplete="tel"
                    />
                  </div>
                </div>

                <div>
                  <h2 className="text-lg font-semibold text-black mb-4">Password</h2>
                  <Input
                    label="Password *"
                    type="password"
                    value={formData.password}
                    onChange={(e) => handleChange("password", e.target.value)}
                    error={errors.password}
                    disabled={claimBlocked}
                    autoComplete="new-password"
                  />
                  <p className="text-xs text-zinc-500 mt-1">At least 8 characters.</p>
                </div>

                <div>
                  <h2 className="text-lg font-semibold text-black mb-4">Categories served *</h2>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    {MATERIAL_CATEGORIES.map((category) => {
                      const categoryId = labelToCategoryId[category as CategoryLabel];
                      const isSelected = categoriesServed.includes(categoryId);
                      return (
                        <button
                          key={categoryId}
                          type="button"
                          onClick={() => handleCategoryToggle(category as CategoryLabel)}
                          disabled={claimBlocked}
                          className={`px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                            isSelected
                              ? "bg-slate-600 text-white border-slate-600"
                              : "bg-white text-zinc-800 border-zinc-300 hover:bg-zinc-50"
                          }`}
                        >
                          {category}
                        </button>
                      );
                    })}
                  </div>
                  {errors.categories && (
                    <p className="mt-2 text-sm text-red-600">{errors.categories}</p>
                  )}
                </div>

                <div>
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.agreedToTerms}
                      onChange={(e) => handleChange("agreedToTerms", e.target.checked)}
                      disabled={claimBlocked}
                      className="mt-1 w-4 h-4 rounded border-zinc-300"
                    />
                    <span className="text-sm text-zinc-700">
                      I agree to the{" "}
                      <Link
                        href="/legal/terms"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-slate-700 font-medium underline"
                      >
                        Agora End User Service Agreement
                      </Link>
                      . *
                    </span>
                  </label>
                  {errors.agreedToTerms && (
                    <p className="mt-1 text-sm text-red-600">{errors.agreedToTerms}</p>
                  )}
                </div>

                {errors.submit && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                    <p className="text-sm text-red-700">{errors.submit}</p>
                  </div>
                )}

                <Button
                  type="submit"
                  variant="primary"
                  size="lg"
                  className="w-full"
                  disabled={isSubmitting || claimBlocked}
                >
                  {isSubmitting ? "Creating account…" : "Create seller account"}
                </Button>

                <p className="text-center text-sm text-zinc-600">
                  Already have an account?{" "}
                  <Link href="/auth/sign-in" className="font-medium text-slate-800 hover:underline">
                    Sign in
                  </Link>
                </p>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}

function SellerSignUpPageWrapper() {
  const searchParams = useSearchParams();
  const supplier = searchParams.get("supplier");
  return <SellerSignUpPageInner key={supplier ?? "public"} />;
}

export default function SellerSignUpPage() {
  return (
    <Suspense fallback={null}>
      <SellerSignUpPageWrapper />
    </Suspense>
  );
}
