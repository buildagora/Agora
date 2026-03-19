"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/AuthProvider";
import { BUYER_CATEGORY_OPTIONS } from "@/lib/categoryDisplay";
import { categoryIdToLabel } from "@/lib/categoryIds";
import Button from "@/components/ui2/Button";
import Card, { CardContent } from "@/components/ui2/Card";
import { trackEvent } from "@/lib/analytics/client";
import { ANALYTICS_EVENTS } from "@/lib/analytics/events";

type NotificationItem = {
  id: string;
  type: string;
  createdAt: string;
  data: {
    supplierName?: string;
    messagePreview?: string;
    urlPath?: string;
    rfqTitle?: string;
    rfqNumber?: string;
    materialRequestId?: string;
    materialRequestText?: string;
    categoryId?: string;
    rfqId?: string;
    contextLabel?: string;
  };
};

type ActivityItem = {
  supplierName: string;
  messagePreview: string;
  timestamp: string;
  urlPath?: string;
  rfqTitle?: string;
  categoryLabel?: string;
  contextLabel?: string;
  materialRequestText?: string;
};

/** Build a single context line for an activity item (request/search it relates to). Prefer server-provided contextLabel. */
function getActivityContextLabel(item: ActivityItem): string {
  if (item.contextLabel?.trim()) return item.contextLabel;
  if (item.rfqTitle?.trim()) return item.rfqTitle;
  if (item.categoryLabel?.trim()) return `${item.categoryLabel} request`;
  return "Recent supplier response";
}

function formatNotificationTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString();
}

/**
 * Buyer Dashboard - Agora's main search surface for finding materials
 *
 * - Hero search (category + text + Find Materials CTA)
 * - Recent Supplier Activity (clickable when urlPath exists)
 */
export default function BuyerDashboardPage() {
  const { user, status } = useAuth();
  const router = useRouter();
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [recentActivity, setRecentActivity] = useState<ActivityItem[]>([]);
  const [activityLoading, setActivityLoading] = useState(true);
  const hasTrackedDashboardView = useRef(false);

  useEffect(() => {
    if (hasTrackedDashboardView.current) return;
    if (status !== "authenticated" || !user || user.role !== "BUYER") return;
    hasTrackedDashboardView.current = true;
    trackEvent(ANALYTICS_EVENTS.dashboard_viewed, { role: "buyer" });
  }, [status, user]);

  useEffect(() => {
    if (status === "loading" || !user || user.role !== "BUYER") {
      return;
    }
    setActivityLoading(true);
    fetch("/api/buyer/notifications", { credentials: "include", cache: "no-store" })
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        const list: NotificationItem[] = Array.isArray(data?.data) ? data.data : (data?.data ?? []);
        const messageNotifications = list.filter((n) => n.type === "MESSAGE_RECEIVED").slice(0, 8);
        const items: ActivityItem[] = messageNotifications.map((n) => {
          const d = n.data ?? {};
          const categoryId = d.categoryId;
          const categoryLabel =
            categoryId && categoryId in categoryIdToLabel
              ? (categoryIdToLabel as Record<string, string>)[categoryId]
              : undefined;
          return {
            supplierName: d.supplierName ?? "Supplier",
            messagePreview: d.messagePreview ?? "New message",
            timestamp: formatNotificationTime(n.createdAt),
            urlPath: d.urlPath,
            rfqTitle: d.rfqTitle,
            contextLabel: d.contextLabel,
            categoryLabel,
            materialRequestText: d.materialRequestText,
          };
        });
        setRecentActivity(items);
      })
      .catch(() => setRecentActivity([]))
      .finally(() => setActivityLoading(false));
  }, [user, status]);

  const handleSearch = () => {
    if (!selectedCategory) return;
    const trimmed = searchQuery.trim();
    const url = trimmed
      ? `/buyer/suppliers?categoryId=${selectedCategory}&q=${encodeURIComponent(trimmed)}`
      : `/buyer/suppliers?categoryId=${selectedCategory}`;
    router.push(url);
  };

  const handleActivityClick = (item: ActivityItem) => {
    if (item.urlPath) router.push(item.urlPath);
  };

  return (
    <div className="flex flex-1 px-6 py-8">
      <div className="w-full max-w-6xl mx-auto">
        {/* Hero search - elevated, unified */}
        <div className="mb-10">
          <Card className="border-zinc-200 dark:border-zinc-700 shadow-md shadow-zinc-200/50 dark:shadow-zinc-900/50">
            <CardContent className="p-8 sm:p-10">
              <h1 className="text-3xl sm:text-4xl font-semibold text-black dark:text-zinc-50 mb-3 tracking-tight">
                What materials are you looking for?
              </h1>
              <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-8 max-w-xl">
                Choose a category (required). Agora routes your request through the supplier network so you can compare and connect.
              </p>
              <div className="flex flex-wrap gap-3 items-stretch rounded-xl bg-zinc-50/80 dark:bg-zinc-800/50 p-4 border border-zinc-100 dark:border-zinc-700/50">
                <select
                  required
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="min-w-[180px] px-4 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 text-black dark:text-zinc-50 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent"
                  aria-label="Category"
                >
                  <option value="" disabled>
                    Choose a category
                  </option>
                  {BUYER_CATEGORY_OPTIONS.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  placeholder="e.g., 2x4 lumber, shingles, concrete mix..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                  className="flex-1 min-w-[200px] px-4 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 text-black dark:text-zinc-50 placeholder-zinc-500 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent"
                  aria-label="Material search"
                />
                <Button variant="primary" size="lg" onClick={handleSearch}>
                  Find Materials
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Recent Supplier Activity – stacked cards */}
        <div>
          <h2 className="text-lg font-semibold text-black dark:text-zinc-50 mb-4">Recent Supplier Activity</h2>
          {activityLoading ? (
            <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-6 text-sm text-zinc-500">
              Loading…
            </div>
          ) : recentActivity.length === 0 ? (
            <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-8 text-center">
              <p className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
                No recent supplier activity yet
              </p>
              <p className="text-sm text-zinc-500 dark:text-zinc-500 mt-1">
                Supplier replies and request updates will appear here
              </p>
            </div>
          ) : (
            <ul className="flex flex-col gap-3 list-none p-0 m-0">
              {recentActivity.map((item, i) => {
                const contextLabel = getActivityContextLabel(item);
                const isClickable = !!item.urlPath;
                const content = (
                  <>
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <p className="font-semibold text-black dark:text-zinc-50">{item.supplierName}</p>
                      <span className="text-xs text-zinc-500 dark:text-zinc-500 shrink-0">{item.timestamp}</span>
                    </div>
                    <p className="text-xs text-zinc-500 dark:text-zinc-500 mb-2">{contextLabel}</p>
                    <p className="text-sm text-zinc-600 dark:text-zinc-400 line-clamp-2">{item.messagePreview}</p>
                  </>
                );
                return (
                  <li key={i}>
                    {isClickable ? (
                      <button
                        type="button"
                        onClick={() => handleActivityClick(item)}
                        className="w-full text-left rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-4 shadow-sm hover:bg-zinc-50 dark:hover:bg-zinc-800/50 hover:border-zinc-300 dark:hover:border-zinc-600 transition-colors cursor-pointer"
                      >
                        {content}
                      </button>
                    ) : (
                      <div className="w-full text-left rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-4 shadow-sm">
                        {content}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
