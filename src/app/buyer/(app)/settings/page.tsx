"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/AuthProvider";
import { signOut } from "@/lib/auth/client";
import Card, { CardHeader, CardContent } from "@/components/ui2/Card";
import Button from "@/components/ui2/Button";
import Input from "@/components/ui2/Input";

export default function BuyerSettingsPage() {
  const router = useRouter();
  const { user, status } = useAuth();
  const [mounted, setMounted] = useState(false);

  // Company/Profile state
  const [companyName, setCompanyName] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (status === "loading") return;
    if (!user || user.role !== "BUYER") {
      router.push("/buyer/dashboard");
      return;
    }

    // Load user data from API
    loadUserData();
  }, [user, status, router]);

  const loadUserData = async () => {
    try {
      const response = await fetch("/api/buyer/settings", {
        credentials: "include",
      });
      if (response.ok) {
        const data = await response.json();
        if (data.companyName) setCompanyName(data.companyName);
        if (data.fullName) setFullName(data.fullName);
        if (data.phone) setPhone(data.phone);
      }
    } catch (error) {
      console.error("Failed to load user data:", error);
    }
  };

  const handleSignOut = async () => {
    const redirectPath = await signOut();
    router.replace(redirectPath);

  };

  const handleSaveProfile = async () => {
    setIsSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    try {
      const response = await fetch("/api/buyer/settings", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          companyName: companyName.trim() || null,
          fullName: fullName.trim() || null,
          phone: phone.trim() || null,
        }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.message || "Failed to save profile");
      }

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Failed to save profile");
    } finally {
      setIsSaving(false);
    }
  };

  if (!mounted || status === "loading") {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="text-zinc-500">Loading...</div>
      </div>
    );
  }

  if (!user || user.role !== "BUYER") {
    return null;
  }

  return (
    <div className="flex flex-1 overflow-y-auto">
      <div className="w-full max-w-[1000px] mx-auto px-6 py-8">
        <h1 className="text-3xl font-bold text-black dark:text-zinc-50 mb-8">Settings</h1>

        <div className="space-y-6">
          {/* Section A: Account */}
          <Card>
            <CardHeader>
              <h2 className="text-xl font-semibold text-black dark:text-zinc-50">Account</h2>
            </CardHeader>
            <CardContent className="px-6 py-4">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                    Email
                  </label>
                  <div className="text-base text-black dark:text-zinc-50">
                    {user.email}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                    Role
                  </label>
                  <div className="text-base text-black dark:text-zinc-50">
                    Buyer
                  </div>
                </div>
                <div className="pt-2">
                  <Button
                    variant="outline"
                    onClick={handleSignOut}
                    className="w-full sm:w-auto"
                  >
                    Sign out
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Section B: Company / Profile */}
          <Card>
            <CardHeader>
              <h2 className="text-xl font-semibold text-black dark:text-zinc-50">Company / Profile</h2>
            </CardHeader>
            <CardContent className="px-6 py-4">
              <div className="space-y-4">
                <Input
                  label="Company name"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="Enter company name"
                />
                <Input
                  label="Full name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Enter full name"
                />
                <Input
                  label="Phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="Enter phone number"
                />
                <div>
                  <label className="block text-sm font-medium text-black dark:text-zinc-50 mb-2">
                    Default delivery address
                  </label>
                  <textarea
                    className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-900 text-black dark:text-zinc-50 placeholder-zinc-500 dark:placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-slate-500 dark:focus:ring-slate-400"
                    rows={3}
                    value={deliveryAddress}
                    onChange={(e) => setDeliveryAddress(e.target.value)}
                    placeholder="Enter default delivery address"
                  />
                </div>
                {saveError && (
                  <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded">
                    <p className="text-sm text-red-600 dark:text-red-400">
                      {saveError}
                    </p>
                  </div>
                )}
                {saveSuccess && (
                  <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded">
                    <p className="text-sm text-green-600 dark:text-green-400">
                      Profile updated successfully
                    </p>
                  </div>
                )}
                <div className="pt-2">
                  <Button
                    variant="primary"
                    onClick={handleSaveProfile}
                    disabled={isSaving}
                    className="w-full sm:w-auto"
                  >
                    {isSaving ? "Saving..." : "Save changes"}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
