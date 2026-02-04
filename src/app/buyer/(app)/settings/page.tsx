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
  const [phone, setPhone] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");

  useEffect(() => {
    setMounted(true);
    if (status === "loading") return;
    if (!user || user.role !== "BUYER") {
      router.push("/buyer/agent");
      return;
    }

    // Load user data
    if (user.companyName) {
      setCompanyName(user.companyName);
    }
    // TODO: Load phone, deliveryAddress from API when backend is ready
  }, [user, status, router]);

  const handleSignOut = async () => {
    await signOut();
    // After sign out, redirect to buyer login (not /auth/sign-in) to preserve routing consistency
    router.push("/buyer/login");
  };

  const handleSaveProfile = async () => {
    // TODO: Wire to API when backend is ready
    console.log("Save profile:", { companyName, phone, deliveryAddress });
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
                  label="Phone number"
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
                <div className="pt-2">
                  <Button
                    variant="primary"
                    onClick={handleSaveProfile}
                    disabled={true}
                    className="w-full sm:w-auto"
                  >
                    Save changes
                  </Button>
                  <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
                    Profile updates will be available soon
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
