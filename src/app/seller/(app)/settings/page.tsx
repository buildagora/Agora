"use client";

import Card, { CardContent, CardHeader } from "@/components/ui2/Card";
import AppShell from "@/components/ui2/AppShell";
import { useAuth } from "@/lib/auth/AuthProvider";

export default function SellerSettingsPage() {
  const { user } = useAuth();
  
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
              Manage suppliers who receive email notifications for new RFQs
            </p>
          </div>

          <Card className="mb-6">
            <CardHeader>
              <h2 className="text-xl font-semibold text-black dark:text-zinc-50">
                Supplier Management
              </h2>
            </CardHeader>
            <CardContent>
              <p className="text-zinc-600 dark:text-zinc-400 text-center py-8">
                Supplier management is not yet available. This feature will be migrated to the API/DB foundation.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
