"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
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
            <h1 className="text-3xl font-semibold text-black">
              Supplier Settings
            </h1>
            <p className="text-sm text-zinc-600 mt-1">
              Manage your supplier account and team
            </p>
          </div>

          <CategoriesSection className="mb-6" />

          <Card className="mb-6">
            <CardHeader>
              <h2 className="text-xl font-semibold text-black">
                Team Management
              </h2>
            </CardHeader>
            <CardContent>
              <p className="text-zinc-600 mb-4">
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

          <Card className="mb-6">
            <CardHeader>
              <h2 className="text-xl font-semibold text-black">
                Support
              </h2>
            </CardHeader>
            <CardContent>
              <p className="text-zinc-600 mb-4">
                Questions or need help using Agora? Reach out directly.
              </p>
              <div className="space-y-2 text-sm">
                <p className="text-zinc-700">
                  Email:{" "}
                  <a href="mailto:buildagora@gmail.com" className="font-medium text-zinc-900 hover:underline">
                    buildagora@gmail.com
                  </a>
                </p>
                <p className="text-zinc-700">
                  Phone:{" "}
                  <a href="tel:+12567015929" className="font-medium text-zinc-900 hover:underline">
                    (256) 701-5929
                  </a>
                </p>
              </div>
              <div className="pt-4">
                <Link href="/support" className="text-sm font-medium text-zinc-900 hover:underline">
                  View support page
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
