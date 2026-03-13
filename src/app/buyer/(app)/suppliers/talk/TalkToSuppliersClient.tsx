"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Card, { CardContent } from "@/components/ui2/Card";
import Button from "@/components/ui2/Button";
import { BUYER_CATEGORY_OPTIONS } from "@/lib/categoryDisplay";
import { categoryIdToLabel } from "@/lib/categoryIds";

const CATEGORIES = [
  { id: "all", label: "All Categories" },
  ...BUYER_CATEGORY_OPTIONS,
];

interface Conversation {
  id: string;
  supplierId: string;
  supplierName: string;
  lastMessagePreview: string;
  lastMessageAt: string;
  unreadCount?: number;
}

interface Supplier {
  id: string;
  name: string;
  categories: string[];
}

export default function TalkToSuppliersClient({
  initialCategoryId,
  initialConversations,
}: {
  initialCategoryId: string;
  initialConversations: Conversation[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supplierIdFromUrl = searchParams.get("supplierId");

  const [conversations, setConversations] = useState<Conversation[]>(initialConversations);
  const [showDiscovery, setShowDiscovery] = useState(initialConversations.length === 0);
  const [selectedCategory, setSelectedCategory] = useState(initialCategoryId || "");
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Handle deep-link: if supplierId is in URL, redirect to thread page
  useEffect(() => {
    if (supplierIdFromUrl) {
      router.replace(`/buyer/suppliers/talk/${supplierIdFromUrl}`);
    }
  }, [supplierIdFromUrl, router]);

  // Fetch conversations on mount
  useEffect(() => {
    fetch("/api/buyer/suppliers/conversations")
      .then((res) => res.json())
      .then((data) => {
        if (data.ok && data.conversations) {
          setConversations(data.conversations || []);
          // If no conversations, show discovery by default
          if (data.conversations.length === 0) {
            setShowDiscovery(true);
          }
        }
      })
      .catch((err) => {
        console.error("Error fetching conversations:", err);
      });
  }, []);

  // Fetch suppliers when selectedCategory changes (only if discovery is shown)
  useEffect(() => {
    if (!showDiscovery || selectedCategory === "") {
      setSuppliers([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    fetch(`/api/buyer/suppliers/talk?categoryId=${selectedCategory}`, {
      cache: "no-store",
    })
      .then((res) => {
        if (!res.ok) {
          throw new Error("Failed to fetch suppliers");
        }
        return res.json();
      })
      .then((data) => {
        if (data.ok && data.suppliers) {
          setSuppliers(data.suppliers || []);
        } else {
          setSuppliers([]);
        }
      })
      .catch((err) => {
        console.error("Error fetching suppliers:", err);
        setError(err.message);
        setSuppliers([]);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [selectedCategory, showDiscovery]);

  const handleCategoryChange = (newValue: string) => {
    setSelectedCategory(newValue);
    if (newValue === "") {
      return;
    }
    router.push(`/buyer/suppliers/talk?categoryId=${newValue}`);
  };

  function formatTime(dateString: string) {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  }

  const showEmptyState = selectedCategory === "" && showDiscovery;
  const showNoSuppliers = !showEmptyState && showDiscovery && !loading && suppliers.length === 0 && selectedCategory !== "";

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left: Conversations List */}
      <div className={`w-full md:w-64 border-r border-zinc-200 dark:border-zinc-800 overflow-y-auto bg-white dark:bg-zinc-900 flex-shrink-0 ${showDiscovery ? "hidden md:block" : "block"}`}>
        <div className="p-4 border-b border-zinc-200 dark:border-zinc-800">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold text-black dark:text-zinc-50">
              Messages
            </h2>
          </div>
          <Button
            onClick={() => setShowDiscovery(true)}
            className="w-full text-sm"
            variant="primary"
          >
            New message
          </Button>
        </div>
        <div className="p-2">
          {conversations.length === 0 ? (
            <div className="text-xs text-zinc-500 dark:text-zinc-400 p-4 text-center">
              No conversations yet
            </div>
          ) : (
            conversations.map((conv) => (
              <Link
                key={conv.id}
                href={`/buyer/suppliers/talk/${conv.supplierId}`}
                className="block"
              >
                <Card className="mb-2 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors">
                  <CardContent className="p-3">
                    <div className="flex items-start gap-2">
                      <div className="w-8 h-8 rounded-full bg-zinc-200 dark:bg-zinc-700 flex items-center justify-center flex-shrink-0">
                        <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                          {conv.supplierName.charAt(0).toUpperCase()}
                        </span>
                      </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <div className="text-sm font-medium text-black dark:text-zinc-50 truncate flex-1">
                          {conv.supplierName}
                        </div>
                        {conv.unreadCount && conv.unreadCount > 0 && (
                          <div className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-500 text-white text-xs font-semibold flex items-center justify-center">
                            {conv.unreadCount > 9 ? "9+" : conv.unreadCount}
                          </div>
                        )}
                      </div>
                      <div className="text-xs text-zinc-500 dark:text-zinc-400 truncate mt-1">
                        {conv.lastMessagePreview}
                      </div>
                      <div className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">
                        {formatTime(conv.lastMessageAt)}
                      </div>
                    </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))
          )}
        </div>
      </div>

      {/* Right: Discovery UI or Empty State */}
      <div className={`flex-1 overflow-y-auto p-6 ${showDiscovery ? "block" : "hidden md:block"}`}>
        {showDiscovery ? (
          <div className="max-w-4xl mx-auto">
            {/* Mobile-only Back Button */}
            <button
              onClick={() => setShowDiscovery(false)}
              className="md:hidden mb-4 flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-50 transition-colors"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
              Back to Messages
            </button>

            <div className="mb-6">
              <h1 className="text-2xl font-semibold text-black dark:text-zinc-50 mb-2">
                Talk to Suppliers
              </h1>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                Select a category to see available suppliers
              </p>
            </div>

            {/* Category Dropdown */}
            <div className="mb-6">
              <select
                value={selectedCategory}
                onChange={(e) => handleCategoryChange(e.target.value)}
                className="w-full max-w-md px-4 py-2 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-black dark:text-zinc-50 focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-zinc-50"
              >
                <option value="" disabled>
                  Select a category...
                </option>
                {CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Supplier List */}
            {showEmptyState ? (
              <div className="text-center py-12">
                <p className="text-zinc-600 dark:text-zinc-400 mb-2">
                  Please select a category to view suppliers
                </p>
                <p className="text-sm text-zinc-500 dark:text-zinc-500">
                  Choose a category from the dropdown above to see available suppliers in that category.
                </p>
              </div>
            ) : loading ? (
              <div className="text-center py-8 text-zinc-600 dark:text-zinc-400">
                Loading suppliers...
              </div>
            ) : error ? (
              <div className="text-center py-8 text-red-600 dark:text-red-400">
                Error: {error}
              </div>
            ) : showNoSuppliers ? (
              <div className="text-center py-8 text-zinc-600 dark:text-zinc-400">
                No suppliers found in this category
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {suppliers.map((supplier) => (
                  <Link
                    key={supplier.id}
                    href={`/buyer/suppliers/talk/${supplier.id}`}
                    className="block"
                  >
                    <Card className="cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors">
                      <CardContent className="p-6">
                        <div className="text-center">
                          <h3 className="text-lg font-semibold text-black dark:text-zinc-50">
                            {supplier.name}
                          </h3>
                          {supplier.categories.length > 0 && (
                            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-2">
                              {supplier.categories
                                .map(
                                  (cat) =>
                                    categoryIdToLabel[
                                      cat as keyof typeof categoryIdToLabel
                                    ] || cat
                                )
                                .join(", ")}
                            </p>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <p className="text-zinc-600 dark:text-zinc-400 mb-4">
                Select a conversation to view messages
              </p>
              <Button onClick={() => setShowDiscovery(true)} variant="primary">
                New message
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
