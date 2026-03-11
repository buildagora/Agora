"use client";

import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { MATERIAL_CATEGORIES } from "@/lib/categoryDisplay";
import { labelToCategoryId, type CategoryLabel } from "@/lib/categoryIds";
import { validateEmailOrTestId, getEmailLabel, getEmailPlaceholder } from "@/lib/validators";
import Button from "@/components/ui2/Button";
import Card, { CardContent, CardHeader } from "@/components/ui2/Card";
import Input from "@/components/ui2/Input";
import AgoraLogo from "@/components/brand/AgoraLogo";

interface SupplierPreview {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  category: string | null;
}

function SellerSignupPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supplierId = searchParams.get("supplier");

  const [supplierPreview, setSupplierPreview] = useState<SupplierPreview | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    companyName: "",
    fullName: "",
    email: "",
    phone: "",
    password: "",
    agreedToTerms: false,
  });
  const [categoriesServed, setCategoriesServed] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Load supplier preview if supplierId is present
  useEffect(() => {
    if (!supplierId) {
      setPreviewError("No supplier ID provided. Please use a valid signup link.");
      return;
    }

    setLoadingPreview(true);
    setPreviewError(null);

    fetch(`/api/seller/supplier-preview?supplierId=${encodeURIComponent(supplierId)}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.ok && data.supplier) {
          setSupplierPreview(data.supplier);
          // Prefill form from supplier data
          setFormData((prev) => ({
            ...prev,
            companyName: data.supplier.name || "",
            email: data.supplier.email || "",
            phone: data.supplier.phone || "",
          }));
          // If supplier has a category, add it to categoriesServed
          if (data.supplier.category) {
            const categoryId = data.supplier.category.toLowerCase();
            if (!categoriesServed.includes(categoryId)) {
              setCategoriesServed([categoryId]);
            }
          }
        } else {
          setPreviewError(data.message || "Supplier not found. Please check your signup link.");
        }
      })
      .catch((error) => {
        console.error("[SUPPLIER_PREVIEW_FETCH_ERROR]", error);
        setPreviewError("Failed to load supplier information. Please try again.");
      })
      .finally(() => {
        setLoadingPreview(false);
      });
  }, [supplierId]);

  const handleChange = (field: string, value: string | boolean) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    // Clear error for this field
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

    setCategoriesServed((prev) => {
      if (prev.includes(categoryId)) {
        return prev.filter((id) => id !== categoryId);
      } else {
        return [...prev, categoryId];
      }
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setIsSubmitting(true);

    try {
      // Validate required fields
      if (!formData.companyName.trim() && !formData.fullName.trim()) {
        setErrors({ companyName: "Company name or full name is required" });
        setIsSubmitting(false);
        return;
      }

      if (!formData.email.trim()) {
        setErrors({ email: "Email is required" });
        setIsSubmitting(false);
        return;
      }

      if (!formData.phone.trim()) {
        setErrors({ phone: "Phone is required" });
        setIsSubmitting(false);
        return;
      }

      if (!formData.password || formData.password.length < 8) {
        setErrors({ password: "Password must be at least 8 characters" });
        setIsSubmitting(false);
        return;
      }

      if (categoriesServed.length === 0) {
        setErrors({ categories: "At least one category is required" });
        setIsSubmitting(false);
        return;
      }

      if (!formData.agreedToTerms) {
        setErrors({ agreedToTerms: "You must agree to the End User Service Agreement" });
        setIsSubmitting(false);
        return;
      }

      // Prepare signup payload
      const payload: any = {
        email: formData.email.trim(),
        password: formData.password,
        role: "SELLER",
        companyName: formData.companyName.trim() || undefined,
        fullName: formData.fullName.trim() || undefined,
        phone: formData.phone.trim(),
        categoryIds: categoriesServed,
        agreedToTerms: true,
      };

      // CRITICAL: If supplierId is present, include it to claim the existing supplier org
      if (supplierId) {
        payload.supplierId = supplierId;
      }

      const response = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok || !data.ok) {
        const errorMessage = data.message || data.error || "Signup failed";
        setErrors({ submit: errorMessage });
        setIsSubmitting(false);
        return;
      }

      // Success - redirect to sign-in
      const returnTo = searchParams.get("returnTo") || "/seller/dashboard";
      router.push(`/auth/sign-in?email=${encodeURIComponent(formData.email)}&returnTo=${encodeURIComponent(returnTo)}`);
    } catch (error) {
      console.error("[SIGNUP_ERROR]", error);
      setErrors({ submit: "An unexpected error occurred. Please try again." });
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl w-full space-y-8">
        <div className="text-center">
          <AgoraLogo className="mx-auto h-12 w-auto" />
          <h2 className="mt-6 text-3xl font-extrabold text-gray-900">
            {supplierId ? "Claim Supplier Account" : "Create Seller Account"}
          </h2>
          {supplierId && (
            <p className="mt-2 text-sm text-gray-600">
              Create your account to claim and manage this supplier organization
            </p>
          )}
        </div>

        <Card>
          <CardContent className="p-6">
            {/* Supplier Preview / Error State */}
            {supplierId && (
              <div className="mb-6">
                {loadingPreview && (
                  <div className="text-sm text-gray-600">Loading supplier information...</div>
                )}
                {previewError && (
                  <div className="p-4 bg-red-50 border border-red-200 rounded-md">
                    <p className="text-sm text-red-800">{previewError}</p>
                    <p className="text-xs text-red-600 mt-2">
                      If you believe this is an error, please contact support.
                    </p>
                  </div>
                )}
                {supplierPreview && !previewError && (
                  <div className="p-4 bg-blue-50 border border-blue-200 rounded-md">
                    <p className="text-sm font-medium text-blue-900">Claiming supplier:</p>
                    <p className="text-sm text-blue-800 mt-1">{supplierPreview.name}</p>
                  </div>
                )}
              </div>
            )}

            <form onSubmit={handleSubmit} className="flex flex-col gap-6">
              <div>
                <h3 className="text-lg font-semibold text-black dark:text-zinc-50 mb-4">
                  Account Information
                </h3>
                <div className="space-y-4">
                  <Input
                    label="Company Name *"
                    type="text"
                    value={formData.companyName}
                    onChange={(e) => handleChange("companyName", e.target.value)}
                    required
                    error={errors.companyName}
                    disabled={loadingPreview}
                  />
                  <Input
                    label="Full Name (Optional)"
                    type="text"
                    value={formData.fullName}
                    onChange={(e) => handleChange("fullName", e.target.value)}
                    error={errors.fullName}
                    disabled={loadingPreview}
                  />
                </div>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-black dark:text-zinc-50 mb-4">
                  Contact Information
                </h3>
                <div className="space-y-4">
                  <Input
                    label={getEmailLabel()}
                    type="email"
                    value={formData.email}
                    onChange={(e) => handleChange("email", e.target.value)}
                    placeholder={getEmailPlaceholder()}
                    required
                    error={errors.email}
                    autoComplete="email"
                    disabled={loadingPreview || (supplierPreview?.email !== null && supplierPreview?.email !== undefined)}
                    helperText={
                      supplierPreview?.email
                        ? "Email is pre-filled from supplier record"
                        : undefined
                    }
                  />
                  <Input
                    label="Phone *"
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => handleChange("phone", e.target.value)}
                    required
                    error={errors.phone}
                    disabled={loadingPreview}
                  />
                </div>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-black dark:text-zinc-50 mb-4">
                  Password
                </h3>
                <Input
                  label="Password *"
                  type="password"
                  value={formData.password}
                  onChange={(e) => handleChange("password", e.target.value)}
                  required
                  error={errors.password}
                  autoComplete="new-password"
                  helperText="Must be at least 8 characters"
                  disabled={loadingPreview}
                />
              </div>

              <div>
                <h3 className="text-lg font-semibold text-black dark:text-zinc-50 mb-4">
                  Categories Served *
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {MATERIAL_CATEGORIES.map((category) => {
                    const categoryId = labelToCategoryId[category as CategoryLabel];
                    const isSelected = categoriesServed.includes(categoryId);
                    return (
                      <button
                        key={categoryId}
                        type="button"
                        onClick={() => handleCategoryToggle(category as CategoryLabel)}
                        disabled={loadingPreview}
                        className={`px-4 py-2 rounded-md border text-sm font-medium transition-colors ${
                          isSelected
                            ? "bg-blue-600 text-white border-blue-600"
                            : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
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
                <label className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={formData.agreedToTerms}
                    onChange={(e) => handleChange("agreedToTerms", e.target.checked)}
                    disabled={loadingPreview}
                    className="mt-1"
                    required
                  />
                  <span className="text-sm text-gray-700">
                    I agree to the{" "}
                    <Link
                      href="/legal/terms"
                      target="_blank"
                      className="text-blue-600 hover:underline"
                    >
                      End User Service Agreement
                    </Link>
                    *
                  </span>
                </label>
                {errors.agreedToTerms && (
                  <p className="mt-1 text-sm text-red-600">{errors.agreedToTerms}</p>
                )}
              </div>

              {errors.submit && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-md">
                  <p className="text-sm text-red-800">{errors.submit}</p>
                </div>
              )}

              <Button
                type="submit"
                variant="primary"
                className="w-full"
                disabled={isSubmitting || loadingPreview}
              >
                {isSubmitting ? "Creating Account..." : "Create Account"}
              </Button>

              <p className="text-center text-sm text-gray-600">
                Already have an account?{" "}
                <Link href="/auth/sign-in" className="text-blue-600 hover:underline">
                  Sign in
                </Link>
              </p>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function SellerSignupPage() {
  return (
    <Suspense fallback={null}>
      <SellerSignupPageInner />
    </Suspense>
  );
}

