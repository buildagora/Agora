"use client";

import Card, { CardContent } from "@/components/ui2/Card";

/**
 * Orders - Open (Placeholder)
 */
export default function OrdersOpenPage() {
  return (
    <div className="flex flex-1 px-6 py-8">
      <div className="w-full max-w-6xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-semibold text-black dark:text-zinc-50">
            Open Orders
          </h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">
            Your active purchase orders
          </p>
        </div>
        <Card>
          <CardContent className="p-6 text-center">
            <p className="text-zinc-600 dark:text-zinc-400">
              Open orders will appear here once you award requests.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}



