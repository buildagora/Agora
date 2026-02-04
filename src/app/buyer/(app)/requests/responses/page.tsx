"use client";

import Card, { CardContent } from "@/components/ui2/Card";

/**
 * Requests - Responses (Placeholder)
 */
export default function RequestsResponsesPage() {
  return (
    <div className="flex flex-1 px-6 py-8">
      <div className="w-full max-w-6xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-semibold text-black dark:text-zinc-50">
            Request Responses
          </h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">
            Supplier responses to your requests
          </p>
        </div>
        <Card>
          <CardContent className="p-6 text-center">
            <p className="text-zinc-600 dark:text-zinc-400">
              Responses will appear here when suppliers submit bids on your requests.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}



