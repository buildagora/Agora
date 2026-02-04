"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/AuthProvider";
// Removed storage imports - using API calls instead
import { getDispatchRecords } from "@/lib/requestDispatch";
import { getOrderByRequestId } from "@/lib/order";
import { detectAllExceptions, type Exception } from "@/lib/exceptionDetection";
import { rfqToRequest } from "@/lib/request";
import Header from "@/components/Header";

/**
 * Get all requests from all buyers
 */
async function getAllRequests(): Promise<Array<{ request: any; buyerId: string }>> {
  // Load RFQs from API (server queries database)
  try {
    const res = await fetch("/api/buyer/rfqs", {
      credentials: "include",
    });
    if (!res.ok) {
      return [];
    }
    const data = await res.json();
    const rfqs = Array.isArray(data) ? data : (data.data || []);
    
    // Convert RFQs to Request format
    const allRequests: Array<{ request: any; buyerId: string }> = [];
    for (const rfq of rfqs) {
      try {
        const request = rfqToRequest(rfq);
        allRequests.push({ request, buyerId: rfq.buyerId || "" });
      } catch {
        // Skip if conversion fails
      }
    }
    return allRequests;
  } catch (error) {
    console.error("Error loading requests:", error);
    return [];
  }
}

/**
 * Calculate age in minutes/hours
 */
function calculateAge(createdAt: string): string {
  const now = new Date().getTime();
  const created = new Date(createdAt).getTime();
  const diffMs = now - created;
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffDays > 0) {
    return `${diffDays}d ${diffHours % 24}h`;
  } else if (diffHours > 0) {
    return `${diffHours}h ${diffMinutes % 60}m`;
  } else {
    return `${diffMinutes}m`;
  }
}

/**
 * Get severity color class
 */
function getSeverityColor(severity: string): string {
  switch (severity) {
    case "critical":
      return "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300";
    case "warning":
      return "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300";
    case "info":
      return "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300";
    default:
      return "bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300";
  }
}

export default function OpsExceptionsPage() {
  const router = useRouter();
  const [exceptions, setExceptions] = useState<Exception[]>([]);
  const [loading, setLoading] = useState(true);

  const { user, status } = useAuth();

  useEffect(() => {
    const loadExceptions = async () => {
      // Wait for auth to load
      if (status === "loading") {
        return;
      }

      // AuthGuard handles auth checks - no manual redirects needed
      // If user is not authenticated or not authorized, AuthGuard will redirect
      if (!user) {
        return; // AuthGuard will handle redirect
      }

      // Load all exceptions
      const allExceptions: Exception[] = [];
      const now = new Date().toISOString();

      // Get all requests from API
      const allRequests = await getAllRequests();
    
    for (const { request, buyerId } of allRequests) {
      try {
        // Get dispatch records for this request
        const dispatchRecords = getDispatchRecords(request.id);
        
        // Get order if exists
        const order = getOrderByRequestId(request.id, buyerId);
        
        // Detect exceptions
        const detectedExceptions = detectAllExceptions({
          request,
          dispatchRecords,
          order,
          now,
        });
        
        // Only include active (non-resolved) exceptions
        const activeExceptions = detectedExceptions.filter((ex) => !ex.isResolved);
        allExceptions.push(...activeExceptions);
      } catch (error) {
        // Silently fail for this request
        if (process.env.NODE_ENV === "development") {
          console.error("Error detecting exceptions for request:", request.id, error);
        }
      }
    }

    // Sort by severity (critical > warning > info) and then by age (oldest first)
    allExceptions.sort((a, b) => {
      const severityOrder = { critical: 3, warning: 2, info: 1 };
      const severityDiff = (severityOrder[b.severity] || 0) - (severityOrder[a.severity] || 0);
      if (severityDiff !== 0) return severityDiff;
      
      const ageA = new Date(a.createdAt).getTime();
      const ageB = new Date(b.createdAt).getTime();
      return ageA - ageB; // Oldest first
    });

      setExceptions(allExceptions);
      setLoading(false);
    };

    loadExceptions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, router, status]);

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col bg-white dark:bg-black">
        <Header />
        <main className="flex flex-1 items-center justify-center">
          <p className="text-zinc-600 dark:text-zinc-400">Loading exceptions...</p>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-white dark:bg-black">
      <Header />

      <main className="flex flex-1 flex-col px-6 py-8 max-w-6xl mx-auto w-full">
        <div className="mb-6">
          <h1 className="text-3xl font-semibold text-black dark:text-zinc-50">
            Exceptions Dashboard
          </h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">
            Active SLA exceptions and workflow issues
          </p>
        </div>

        {exceptions.length === 0 ? (
          <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-8 text-center">
            <p className="text-zinc-600 dark:text-zinc-400">
              No active exceptions found. All requests and orders are on track.
            </p>
          </div>
        ) : (
          <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden">
            <table className="w-full">
              <thead className="bg-zinc-50 dark:bg-zinc-900">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-medium text-black dark:text-zinc-50">
                    Severity
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-black dark:text-zinc-50">
                    Type
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-black dark:text-zinc-50">
                    Message
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-black dark:text-zinc-50">
                    Request/Order
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-black dark:text-zinc-50">
                    Age
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {exceptions.map((exception) => (
                  <tr
                    key={exception.id}
                    className="hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <span
                        className={`text-xs px-2 py-1 rounded font-medium ${getSeverityColor(
                          exception.severity
                        )}`}
                      >
                        {exception.severity.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-black dark:text-zinc-50">
                      {exception.type.replace(/_/g, " ")}
                    </td>
                    <td className="px-4 py-3 text-sm text-zinc-600 dark:text-zinc-400">
                      {exception.message}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1">
                        <Link
                          href={`/buyer/rfqs/${exception.relatedIds.requestId}`}
                          className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                        >
                          Request: {exception.relatedIds.requestId.substring(0, 8)}
                        </Link>
                        {exception.relatedIds.orderId && (
                          <span className="text-xs text-zinc-500 dark:text-zinc-500">
                            Order: {exception.relatedIds.orderId.substring(0, 8)}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-zinc-600 dark:text-zinc-400">
                      {calculateAge(exception.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-6 text-sm text-zinc-500 dark:text-zinc-500">
          <p>
            Total active exceptions: <span className="font-medium">{exceptions.length}</span>
          </p>
          <p className="mt-1">
            Critical:{" "}
            <span className="font-medium">
              {exceptions.filter((e) => e.severity === "critical").length}
            </span>{" "}
            | Warning:{" "}
            <span className="font-medium">
              {exceptions.filter((e) => e.severity === "warning").length}
            </span>{" "}
            | Info:{" "}
            <span className="font-medium">
              {exceptions.filter((e) => e.severity === "info").length}
            </span>
          </p>
        </div>
      </main>
    </div>
  );
}

