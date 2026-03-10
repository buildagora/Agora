"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useAuth } from "@/lib/auth/AuthProvider";
import { getRequest, type RFQRequest } from "@/lib/request";
import Header from "@/components/Header";

export default function RequestPreviewPage() {
  const params = useParams();
  const requestId = params.id as string;
  const { user, status } = useAuth();
  const [request, setRequest] = useState<RFQRequest | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // NEW FOUNDATION: AuthGuard handles auth/role checks
    // This effect only loads data when user is authenticated and role matches
    if (status === "loading") {
      return;
    }

    if (!user || user.role !== "BUYER") {
      setLoading(false);
      return;
    }

    // Load request
    (async () => {
      const foundRequest = await getRequest(requestId, user.id);
      setRequest(foundRequest);
      setLoading(false);
    })();
  }, [requestId, user, status]);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col bg-white dark:bg-black">
        <Header />
        <main className="flex flex-1 items-center justify-center">
          <p className="text-zinc-600 dark:text-zinc-400">Loading...</p>
        </main>
      </div>
    );
  }

  if (!request) {
    return (
      <div className="flex min-h-screen flex-col bg-white dark:bg-black">
        <Header />
        <main className="flex flex-1 px-6 py-8 max-w-4xl mx-auto w-full">
          <div className="w-full">
            <div className="mt-8 text-center">
              <p className="text-zinc-600 dark:text-zinc-400">Request not found.</p>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-white dark:bg-black">
      <Header />

      {/* Main content - print-friendly layout */}
      <main className="flex flex-1 px-6 py-8 max-w-4xl mx-auto w-full print:px-4 print:py-4">
        <div className="w-full">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-semibold text-black dark:text-zinc-50 mb-2">
              {request.jobName || "Material Request"}
            </h1>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Request ID: {request.id}
            </p>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Created: {formatDate(request.createdAt)}
            </p>
            {request.status && (
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                Status: <span className="font-medium capitalize">{request.status}</span>
              </p>
            )}
          </div>

          {/* Delivery Information */}
          <div className="mb-8 border-b border-zinc-200 dark:border-zinc-800 pb-6">
            <h2 className="text-xl font-semibold text-black dark:text-zinc-50 mb-4">
              Delivery Information
            </h2>
            <div className="space-y-2 text-sm">
              <div>
                <span className="font-medium text-black dark:text-zinc-50">Mode: </span>
                <span className="text-zinc-700 dark:text-zinc-300 capitalize">
                  {request.delivery.mode}
                </span>
              </div>
              <div>
                <span className="font-medium text-black dark:text-zinc-50">Need By: </span>
                <span className="text-zinc-700 dark:text-zinc-300">
                  {formatDateTime(request.delivery.needBy)}
                </span>
              </div>
              {request.delivery.mode === "delivery" && request.delivery.address && (
                <div>
                  <span className="font-medium text-black dark:text-zinc-50">Delivery Address: </span>
                  <span className="text-zinc-700 dark:text-zinc-300">
                    {request.delivery.address}
                  </span>
                </div>
              )}
              {request.delivery.mode === "pickup" && request.delivery.pickupWindow && (
                <div>
                  <span className="font-medium text-black dark:text-zinc-50">Pickup Window: </span>
                  <span className="text-zinc-700 dark:text-zinc-300">
                    {request.delivery.pickupWindow}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Line Items */}
          <div className="mb-8 border-b border-zinc-200 dark:border-zinc-800 pb-6 print:mb-4 print:pb-4 print:break-inside-avoid">
            <h2 className="text-xl font-semibold text-black dark:text-zinc-50 mb-4 print:text-lg print:mb-2">
              Line Items
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-zinc-200 dark:border-zinc-800">
                    <th className="text-left py-2 px-4 font-semibold text-black dark:text-zinc-50">
                      Description
                    </th>
                    <th className="text-right py-2 px-4 font-semibold text-black dark:text-zinc-50">
                      Quantity
                    </th>
                    <th className="text-left py-2 px-4 font-semibold text-black dark:text-zinc-50">
                      Unit
                    </th>
                    {request.items.some((item) => item.category && item.category !== "unknown") && (
                      <th className="text-left py-2 px-4 font-semibold text-black dark:text-zinc-50">
                        Category
                      </th>
                    )}
                    {request.items.some((item) => item.sku) && (
                      <th className="text-left py-2 px-4 font-semibold text-black dark:text-zinc-50">
                        SKU
                      </th>
                    )}
                    {request.items.some((item) => item.brand) && (
                      <th className="text-left py-2 px-4 font-semibold text-black dark:text-zinc-50">
                        Brand
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {request.items.map((item, index) => (
                    <tr
                      key={item.id || index}
                      className="border-b border-zinc-100 dark:border-zinc-900"
                    >
                      <td className="py-3 px-4 text-zinc-700 dark:text-zinc-300">
                        {item.description}
                      </td>
                      <td className="py-3 px-4 text-right text-zinc-700 dark:text-zinc-300">
                        {item.quantity}
                      </td>
                      <td className="py-3 px-4 text-zinc-700 dark:text-zinc-300 uppercase">
                        {item.unit}
                      </td>
                      {request.items.some((i) => i.category && i.category !== "unknown") && (
                        <td className="py-3 px-4 text-zinc-700 dark:text-zinc-300">
                          {item.category && item.category !== "unknown" ? item.category : "—"}
                        </td>
                      )}
                      {request.items.some((i) => i.sku) && (
                        <td className="py-3 px-4 text-zinc-700 dark:text-zinc-300">
                          {item.sku || "—"}
                        </td>
                      )}
                      {request.items.some((i) => i.brand) && (
                        <td className="py-3 px-4 text-zinc-700 dark:text-zinc-300">
                          {item.brand || "—"}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Substitutions */}
          {request.substitutionsAllowed !== undefined && (
            <div className="mb-8 border-b border-zinc-200 dark:border-zinc-800 pb-6 print:mb-4 print:pb-4 print:break-inside-avoid">
              <h2 className="text-xl font-semibold text-black dark:text-zinc-50 mb-2 print:text-lg">
                Substitutions
              </h2>
              <p className="text-sm text-zinc-700 dark:text-zinc-300">
                {request.substitutionsAllowed
                  ? "Substitutions are allowed for all items."
                  : "Substitutions are not allowed."}
              </p>
            </div>
          )}

          {/* Notes */}
          {request.notes && (
            <div className="mb-8 border-b border-zinc-200 dark:border-zinc-800 pb-6 print:mb-4 print:pb-4 print:break-inside-avoid">
              <h2 className="text-xl font-semibold text-black dark:text-zinc-50 mb-2 print:text-lg">
                Notes
              </h2>
              <p className="text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap">
                {request.notes}
              </p>
            </div>
          )}

          {/* Footer */}
          <div className="mt-8 pt-6 border-t border-zinc-200 dark:border-zinc-800">
            <p className="text-xs text-zinc-500 dark:text-zinc-500 text-center">
              Generated on {formatDateTime(new Date().toISOString())}
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}

