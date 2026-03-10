"use client";

import { useRouter } from "next/navigation";
import Card, { CardContent, CardHeader } from "@/components/ui2/Card";
import Button from "@/components/ui2/Button";
import AppShell from "@/components/ui2/AppShell";
import { useAuth } from "@/lib/auth/AuthProvider";
import CategoriesSection from "./CategoriesSection";

export default function SellerSettingsPage() {
  const { user } = useAuth();
  const router = useRouter();
  
  // CRITICAL: Safety net - BUYER must NEVER render seller pages
  if (user?.role !== "SELLER") {
    return null;
  }
  return (
    <AppShell role="seller" active="settings">
      <div className="flex flex-1 px-6 py-8">
        <div className="w-full max-w-4xl mx-auto">
          <div className="mb-6">
            <h1 className="text-3xl font-semibold text-black dark:text-zinc-50">
              Supplier Settings
            </h1>
            <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">
              Manage your supplier account and team
            </p>
          </div>

          <CategoriesSection className="mb-6" />

          <Card className="mb-6">
            <CardHeader>
              <h2 className="text-xl font-semibold text-black dark:text-zinc-50">
                Team Management
              </h2>
            </CardHeader>
            <CardContent>
              <p className="text-zinc-600 dark:text-zinc-400 mb-4">
                Invite team members to collaborate on your supplier account. Team members can view and respond to buyer messages.
              </p>
              <Button
                variant="primary"
                onClick={() => router.push("/seller/settings/team")}
              >
                Manage Team
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
