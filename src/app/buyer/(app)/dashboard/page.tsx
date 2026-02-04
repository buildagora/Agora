"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth/AuthProvider";
import Button from "@/components/ui2/Button";
import Card, { CardContent } from "@/components/ui2/Card";

/**
 * Buyer Dashboard - Simple overview page inside BuyerShell
 * 
 * Provides:
 * - Summary cards for key metrics
 * - Recent activity
 * - Primary CTA to create new request via Agent
 */
export default function BuyerDashboardPage() {
  const { user, status } = useAuth();
  const [rfqsCount, setRfqsCount] = useState<number | null>(null);
  const [openOrdersCount, setOpenOrdersCount] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (status === "loading" || !user || user.role !== "BUYER") {
      return;
    }

    // Load RFQs count
    const loadData = async () => {
      try {
        const res = await fetch("/api/buyer/rfqs", {
          credentials: "include",
          cache: "no-store",
        });
        if (res.ok) {
          const data = await res.json();
          const rfqs = Array.isArray(data) ? data : (data.data || []);
          setRfqsCount(rfqs.length);
          
          // Count open orders (RFQs with status AWARDED or OPEN with bids)
          const openOrders = rfqs.filter((r: any) => r.status === "AWARDED").length;
          setOpenOrdersCount(openOrders);
        }
      } catch (error) {
        console.error("Error loading dashboard data:", error);
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [user, status]);

  return (
    <div className="flex flex-1 px-6 py-8">
      <div className="w-full max-w-6xl mx-auto">
        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-semibold text-black dark:text-zinc-50 mb-2">
            Dashboard
          </h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Overview of your requests, orders, and supplier activity
          </p>
        </div>

        {/* Primary CTA */}
        <Card className="mb-6">
          <CardContent className="p-6">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div>
                <h3 className="text-lg font-semibold text-black dark:text-zinc-50 mb-1">
                  Create New Request
                </h3>
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                  Start a conversation with Agora Agent to create a material request
                </p>
              </div>
              <Link href="/buyer/agent">
                <Button variant="primary" size="lg">
                  New Request
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <Card>
            <CardContent className="p-6">
              <div>
                <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-1">
                  Total Requests
                </p>
                <p className="text-3xl font-bold text-black dark:text-zinc-50">
                  {isLoading ? "..." : (rfqsCount ?? 0)}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div>
                <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-1">
                  Open Orders
                </p>
                <p className="text-3xl font-bold text-black dark:text-zinc-50">
                  {isLoading ? "..." : (openOrdersCount ?? 0)}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div>
                <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-1">
                  Awaiting Quotes
                </p>
                <p className="text-3xl font-bold text-black dark:text-zinc-50">
                  {isLoading ? "..." : (rfqsCount !== null ? Math.max(0, rfqsCount - (openOrdersCount ?? 0)) : 0)}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Quick Links */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Link href="/buyer/rfqs">
            <Card className="hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors cursor-pointer">
              <CardContent className="p-6">
                <h3 className="font-semibold text-black dark:text-zinc-50 mb-2">
                  View All Requests
                </h3>
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                  Manage your material requests and track supplier responses
                </p>
              </CardContent>
            </Card>
          </Link>

          <Link href="/buyer/orders/open">
            <Card className="hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors cursor-pointer">
              <CardContent className="p-6">
                <h3 className="font-semibold text-black dark:text-zinc-50 mb-2">
                  View Orders
                </h3>
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                  Track your open and completed purchase orders
                </p>
              </CardContent>
            </Card>
          </Link>
        </div>
      </div>
    </div>
  );
}
