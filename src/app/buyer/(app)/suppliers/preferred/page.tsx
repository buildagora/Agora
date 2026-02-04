"use client";

import Card, { CardContent } from "@/components/ui2/Card";
import Link from "next/link";
import Button from "@/components/ui2/Button";

/**
 * Suppliers - Preferred (Placeholder)
 * 
 * TODO: Replace with actual preferred suppliers from /buyer/settings/preferred-suppliers
 */
export default function SuppliersPreferredPage() {
  return (
    <div className="flex flex-1 px-6 py-8">
      <div className="w-full max-w-6xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-semibold text-black dark:text-zinc-50">
            Preferred Suppliers
          </h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">
            Your preferred supplier network
          </p>
        </div>
        <Card>
          <CardContent className="p-6 text-center">
            <p className="text-zinc-600 dark:text-zinc-400 mb-4">
              Manage your preferred suppliers in settings.
            </p>
            <Link href="/buyer/settings/preferred-suppliers">
              <Button variant="primary" size="md">
                Manage Preferred Suppliers
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}



