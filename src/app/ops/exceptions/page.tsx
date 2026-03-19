"use client";

// DO NOT IMPORT server-only modules here
// This component only fetches data from API routes

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/AuthProvider";
import { type Exception } from "@/lib/exceptionDetection";
import Header from "@/components/Header";

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
      return "bg-red-100 text-red-700";
    case "warning":
      return "bg-amber-100 text-amber-700";
    case "info":
      return "bg-blue-100 text-blue-700";
    default:
      return "bg-zinc-100 text-zinc-700";
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

      // Load exceptions from API route (server-side)
      try {
        const res = await fetch("/api/ops/exceptions", {
          credentials: "include",
        });
        
        if (!res.ok) {
          console.error("Failed to load exceptions:", res.status);
          setExceptions([]);
          setLoading(false);
          return;
        }

        const data = await res.json();
        if (data.ok && Array.isArray(data.exceptions)) {
          setExceptions(data.exceptions);
        } else {
          setExceptions([]);
        }
      } catch (error) {
        console.error("Error loading exceptions:", error);
        setExceptions([]);
      } finally {
        setLoading(false);
      }
    };

    loadExceptions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, router, status]);

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col bg-white">
        <Header />
        <main className="flex flex-1 items-center justify-center">
          <p className="text-zinc-600">Loading exceptions...</p>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <Header />

      <main className="flex flex-1 flex-col px-6 py-8 max-w-6xl mx-auto w-full">
        <div className="mb-6">
          <h1 className="text-3xl font-semibold text-black">
            Exceptions Dashboard
          </h1>
          <p className="text-sm text-zinc-600 mt-1">
            Active SLA exceptions and workflow issues
          </p>
        </div>

        {exceptions.length === 0 ? (
          <div className="border border-zinc-200 rounded-lg p-8 text-center">
            <p className="text-zinc-600">
              No active exceptions found. All requests and orders are on track.
            </p>
          </div>
        ) : (
          <div className="border border-zinc-200 rounded-lg overflow-hidden">
            <table className="w-full">
              <thead className="bg-zinc-50">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-medium text-black">
                    Severity
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-black">
                    Type
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-black">
                    Message
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-black">
                    Request/Order
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-black">
                    Age
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200">
                {exceptions.map((exception) => (
                  <tr
                    key={exception.id}
                    className="hover:bg-zinc-50 transition-colors"
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
                    <td className="px-4 py-3 text-sm text-black">
                      {exception.type.replace(/_/g, " ")}
                    </td>
                    <td className="px-4 py-3 text-sm text-zinc-600">
                      {exception.message}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1">
                        <Link
                          href={`/buyer/rfqs/${exception.relatedIds.requestId}`}
                          className="text-sm text-blue-600 hover:underline"
                        >
                          Request: {exception.relatedIds.requestId.substring(0, 8)}
                        </Link>
                        {exception.relatedIds.orderId && (
                          <span className="text-xs text-zinc-500">
                            Order: {exception.relatedIds.orderId.substring(0, 8)}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-zinc-600">
                      {calculateAge(exception.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-6 text-sm text-zinc-500">
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

