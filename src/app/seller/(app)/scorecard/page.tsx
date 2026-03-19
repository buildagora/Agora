"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth/AuthProvider";
import { getSupplierMetrics, type SupplierMetrics } from "@/lib/supplierMetrics";
import AppShell from "@/components/ui2/AppShell";
import Card, { CardContent } from "@/components/ui2/Card";

function areAllMetricsNA(m: SupplierMetrics): boolean {
  return (
    m.responseRate === "N/A" &&
    m.medianResponseTimeMinutes === "N/A" &&
    m.winRate === "N/A" &&
    m.onTimeConfirmRate === "N/A" &&
    m.onTimeDeliveryRate === "N/A"
  );
}

function formatMetric(value: number | "N/A", isPercentage: boolean = false): string {
  if (value === "N/A") return "N/A";
  if (typeof value === "number") {
    if (isPercentage) return `${(value * 100).toFixed(1)}%`;
    if (value < 1) return "< 1 min";
    return `${Math.round(value)} min`;
  }
  return "N/A";
}

function getMetricColor(value: number | "N/A", isPercentage: boolean = false): string {
  if (value === "N/A") return "text-zinc-500";
  if (typeof value === "number") {
    if (isPercentage) {
      if (value > 0.8) return "text-green-600";
      if (value > 0.6) return "text-amber-600";
      return "text-red-600";
    }
    if (value < 60) return "text-green-600";
    if (value < 120) return "text-amber-600";
    return "text-red-600";
  }
  return "text-zinc-500";
}

export default function SellerScorecardPage() {
  const { user: currentUser, status } = useAuth();
  const [metrics, setMetrics] = useState<SupplierMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [windowDays, setWindowDays] = useState(30);

  useEffect(() => {
    if (status === "loading") return;
    if (!currentUser || currentUser.role !== "SELLER") {
      setLoading(false);
      return;
    }
    try {
      setMetrics(getSupplierMetrics(currentUser.id, windowDays));
    } catch (error) {
      console.error("Error loading supplier metrics:", error);
      setMetrics(null);
    } finally {
      setLoading(false);
    }
  }, [windowDays, currentUser?.id, status]);

  const showMetricGrid = metrics && !areAllMetricsNA(metrics);

  return (
    <AppShell role="seller" active="scorecard">
      <div className="flex flex-1 px-6 py-8">
        <div className="w-full max-w-4xl mx-auto">
          <div className="mb-6">
            <h1 className="text-3xl font-semibold text-black">
              Performance Scorecard
            </h1>
            <p className="text-sm text-zinc-600 mt-1">
              Your supplier performance metrics
            </p>
          </div>

          {status === "loading" || loading ? (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-zinc-600">Loading metrics...</p>
              </CardContent>
            </Card>
          ) : !currentUser || currentUser.role !== "SELLER" ? (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-zinc-600">Access denied. Seller access required.</p>
              </CardContent>
            </Card>
          ) : !showMetricGrid ? (
            /* Honest empty/unavailable state – no wall of N/A cards */
            <Card>
              <CardContent className="py-12 px-8 text-center max-w-lg mx-auto">
                <p className="text-base font-medium text-zinc-700">
                  Live performance metrics are not available yet
                </p>
                <p className="text-sm text-zinc-500 mt-2 leading-relaxed">
                  Scorecard metrics will appear as supplier response and fulfillment tracking is enabled for the live workflow.
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="flex items-center gap-2 mb-6">
                <label className="text-sm text-zinc-600">Time period:</label>
                <select
                  value={windowDays}
                  onChange={(e) => setWindowDays(Number(e.target.value))}
                  className="px-3 py-1.5 text-sm border border-zinc-300 rounded-lg bg-white text-black focus:outline-none focus:ring-2 focus:ring-slate-500"
                >
                  <option value={7}>Last 7 days</option>
                  <option value={30}>Last 30 days</option>
                  <option value={90}>Last 90 days</option>
                  <option value={180}>Last 180 days</option>
                </select>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card>
                  <CardContent className="p-6">
                    <h3 className="text-sm font-medium text-zinc-600 mb-2">Response Rate</h3>
                    <p className={`text-3xl font-bold ${getMetricColor(metrics!.responseRate, true)}`}>
                      {formatMetric(metrics!.responseRate, true)}
                    </p>
                    <p className="text-xs text-zinc-500 mt-2">Percentage of requests responded to</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-6">
                    <h3 className="text-sm font-medium text-zinc-600 mb-2">Median Response Time</h3>
                    <p className={`text-3xl font-bold ${getMetricColor(metrics!.medianResponseTimeMinutes, false)}`}>
                      {formatMetric(metrics!.medianResponseTimeMinutes, false)}
                    </p>
                    <p className="text-xs text-zinc-500 mt-2">Time from dispatch to first response</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-6">
                    <h3 className="text-sm font-medium text-zinc-600 mb-2">Win Rate</h3>
                    <p className={`text-3xl font-bold ${getMetricColor(metrics!.winRate, true)}`}>
                      {formatMetric(metrics!.winRate, true)}
                    </p>
                    <p className="text-xs text-zinc-500 mt-2">Percentage of bids that were awarded</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-6">
                    <h3 className="text-sm font-medium text-zinc-600 mb-2">On-Time Confirm Rate</h3>
                    <p className={`text-3xl font-bold ${getMetricColor(metrics!.onTimeConfirmRate, true)}`}>
                      {formatMetric(metrics!.onTimeConfirmRate, true)}
                    </p>
                    <p className="text-xs text-zinc-500 mt-2">
                      Orders confirmed within {windowDays === 30 ? "4 hours" : "SLA"}
                    </p>
                  </CardContent>
                </Card>
                <Card className="md:col-span-2">
                  <CardContent className="p-6">
                    <h3 className="text-sm font-medium text-zinc-600 mb-2">On-Time Delivery Rate</h3>
                    <p className={`text-3xl font-bold ${getMetricColor(metrics!.onTimeDeliveryRate, true)}`}>
                      {formatMetric(metrics!.onTimeDeliveryRate, true)}
                    </p>
                    <p className="text-xs text-zinc-500 mt-2">Orders delivered by need-by date or within SLA</p>
                  </CardContent>
                </Card>
              </div>
            </>
          )}
        </div>
      </div>
    </AppShell>
  );
}
