"use client";

import { FEATURES } from "@/config/features";
import Card, { CardContent } from "@/components/ui2/Card";

/**
 * Requests - Drafts (Placeholder)
 */
export default function RequestsDraftsPage() {
  return (
    <div className="flex flex-1 px-6 py-8">
      <div className="w-full max-w-6xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-semibold text-black dark:text-zinc-50">
            Draft Requests
          </h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">
            Your draft material requests
          </p>
        </div>
        <Card>
          <CardContent className="p-6 text-center">
            <p className="text-zinc-600 dark:text-zinc-400">
              {FEATURES.AGENT_ENABLED
                ? "Draft requests will appear here. Create a request using Agora Agent."
                : "Draft requests will appear here. Create a request from the dashboard."}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}



