"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth/AuthProvider";
import { getSupplierMetrics, type SupplierMetrics } from "@/lib/supplierMetrics";
import Header from "@/components/Header";
import Link from "next/link";

export default function SellerScorecardPage() {
  const { user: currentUser, status } = useAuth();
  const [metrics, setMetrics] = useState<SupplierMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [windowDays, setWindowDays] = useState(30);

  useEffect(() => {
    // Wait for auth to load
    if (status === "loading") {
      return;
    }

    if (!currentUser || currentUser.role !== "SELLER") {
      setLoading(false);
      return;
    }

    try {
      const computedMetrics = getSupplierMetrics(currentUser.id, windowDays);
      setMetrics(computedMetrics);
    } catch (error) {
      console.error("Error loading supplier metrics:", error);
    } finally {
      setLoading(false);
    }
  }, [windowDays, currentUser, status]);

  const formatMetric = (value: number | "N/A", isPercentage: boolean = false): string => {
    if (value === "N/A") {
      return "N/A";
    }
    if (typeof value === "number") {
      if (isPercentage) {
        // Percentage (0-1)
        return `${(value * 100).toFixed(1)}%`;
      } else {
        // Time in minutes
        if (value < 1) {
          return "< 1 min";
        }
        return `${Math.round(value)} min`;
      }
    }
    return "N/A";
  };

  const getMetricColor = (value: number | "N/A", isPercentage: boolean = false): string => {
    if (value === "N/A") {
      return "text-zinc-500 dark:text-zinc-500";
    }
    if (typeof value === "number") {
      if (isPercentage) {
        // For percentages: green if > 80%, yellow if > 60%, red otherwise
        if (value > 0.8) return "text-green-600 dark:text-green-400";
        if (value > 0.6) return "text-amber-600 dark:text-amber-400";
        return "text-red-600 dark:text-red-400";
      } else {
        // For response time: green if < 60 min, yellow if < 120 min, red otherwise
        if (value < 60) return "text-green-600 dark:text-green-400";
        if (value < 120) return "text-amber-600 dark:text-amber-400";
        return "text-red-600 dark:text-red-400";
      }
    }
    return "text-zinc-500 dark:text-zinc-500";
  };

  if (status === "loading" || loading) {
    return (
      <div className="flex min-h-screen flex-col bg-white dark:bg-black">
        <Header />
        <main className="flex flex-1 items-center justify-center px-6 py-8">
          <p className="text-zinc-600 dark:text-zinc-400">Loading metrics...</p>
        </main>
      </div>
    );
  }

  if (!currentUser || currentUser.role !== "SELLER") {
    return (
      <div className="flex min-h-screen flex-col bg-white dark:bg-black">
        <Header />
        <main className="flex flex-1 items-center justify-center px-6 py-8">
          <p className="text-zinc-600 dark:text-zinc-400">Access denied. Seller access required.</p>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-white dark:bg-black">
      <Header />
      <main className="flex flex-1 px-6 py-8 max-w-4xl mx-auto w-full">
        <div className="w-full">
          <div className="mb-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h1 className="text-3xl font-semibold text-black dark:text-zinc-50">
                  Performance Scorecard
                </h1>
                <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">
                  Your supplier performance metrics
                </p>
              </div>
              <Link
                href="/seller/dashboard"
                className="px-4 py-2 text-sm border border-zinc-300 dark:border-zinc-700 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-900 text-black dark:text-zinc-50"
              >
                Back to Dashboard
              </Link>
            </div>

            {/* Time Window Selector */}
            <div className="flex items-center gap-2 mb-6">
              <label className="text-sm text-zinc-600 dark:text-zinc-400">
                Time period:
              </label>
              <select
                value={windowDays}
                onChange={(e) => setWindowDays(Number(e.target.value))}
                className="px-3 py-1.5 text-sm border border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-black dark:text-zinc-50 focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-zinc-50"
              >
                <option value={7}>Last 7 days</option>
                <option value={30}>Last 30 days</option>
                <option value={90}>Last 90 days</option>
                <option value={180}>Last 180 days</option>
              </select>
            </div>
          </div>

          {/* Metrics Grid */}
          {metrics && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Response Rate */}
              <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-6">
                <h3 className="text-sm font-medium text-zinc-600 dark:text-zinc-400 mb-2">
                  Response Rate
                </h3>
                <p className={`text-3xl font-bold ${getMetricColor(metrics.responseRate, true)}`}>
                  {formatMetric(metrics.responseRate, true)}
                </p>
                <p className="text-xs text-zinc-500 dark:text-zinc-500 mt-2">
                  Percentage of requests responded to
                </p>
              </div>

              {/* Median Response Time */}
              <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-6">
                <h3 className="text-sm font-medium text-zinc-600 dark:text-zinc-400 mb-2">
                  Median Response Time
                </h3>
                <p className={`text-3xl font-bold ${getMetricColor(metrics.medianResponseTimeMinutes, false)}`}>
                  {formatMetric(metrics.medianResponseTimeMinutes, false)}
                </p>
                <p className="text-xs text-zinc-500 dark:text-zinc-500 mt-2">
                  Time from dispatch to first response
                </p>
              </div>

              {/* Win Rate */}
              <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-6">
                <h3 className="text-sm font-medium text-zinc-600 dark:text-zinc-400 mb-2">
                  Win Rate
                </h3>
                <p className={`text-3xl font-bold ${getMetricColor(metrics.winRate, true)}`}>
                  {formatMetric(metrics.winRate, true)}
                </p>
                <p className="text-xs text-zinc-500 dark:text-zinc-500 mt-2">
                  Percentage of bids that were awarded
                </p>
              </div>

              {/* On-Time Confirm Rate */}
              <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-6">
                <h3 className="text-sm font-medium text-zinc-600 dark:text-zinc-400 mb-2">
                  On-Time Confirm Rate
                </h3>
                <p className={`text-3xl font-bold ${getMetricColor(metrics.onTimeConfirmRate, true)}`}>
                  {formatMetric(metrics.onTimeConfirmRate, true)}
                </p>
                <p className="text-xs text-zinc-500 dark:text-zinc-500 mt-2">
                  Orders confirmed within {windowDays === 30 ? "4 hours" : "SLA"}
                </p>
              </div>

              {/* On-Time Delivery Rate */}
              <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-6 md:col-span-2">
                <h3 className="text-sm font-medium text-zinc-600 dark:text-zinc-400 mb-2">
                  On-Time Delivery Rate
                </h3>
                <p className={`text-3xl font-bold ${getMetricColor(metrics.onTimeDeliveryRate, true)}`}>
                  {formatMetric(metrics.onTimeDeliveryRate, true)}
                </p>
                <p className="text-xs text-zinc-500 dark:text-zinc-500 mt-2">
                  Orders delivered by need-by date or within SLA
                </p>
              </div>
            </div>
          )}

          {/* Empty State */}
          {metrics && 
           metrics.responseRate === "N/A" && 
           metrics.medianResponseTimeMinutes === "N/A" && 
           metrics.winRate === "N/A" && 
           metrics.onTimeConfirmRate === "N/A" && 
           metrics.onTimeDeliveryRate === "N/A" && (
            <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-8 text-center">
              <p className="text-zinc-600 dark:text-zinc-400 mb-2">
                No metrics available for the selected time period
              </p>
              <p className="text-sm text-zinc-500 dark:text-zinc-500">
                Metrics will appear as you respond to requests and complete orders
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

