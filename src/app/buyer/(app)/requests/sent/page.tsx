"use client";

import Card, { CardContent } from "@/components/ui2/Card";
import Link from "next/link";
import Button from "@/components/ui2/Button";

/**
 * Requests - Sent (Placeholder)
 * 
 * TODO: Replace with actual RFQ list from /buyer/rfqs
 */
export default function RequestsSentPage() {
  return (
    <div className="flex flex-1 px-6 py-8">
      <div className="w-full max-w-6xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-semibold text-black">
            Sent Requests
          </h1>
          <p className="text-sm text-zinc-600 mt-1">
            Your sent material requests
          </p>
        </div>
        <Card>
          <CardContent className="p-6 text-center">
            <p className="text-zinc-600 mb-4">
              Sent requests will appear here. View all requests in the RFQ list.
            </p>
            <Link href="/buyer/rfqs">
              <Button variant="primary" size="md">
                View All RFQs
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}



