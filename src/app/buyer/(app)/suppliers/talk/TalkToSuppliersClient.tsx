"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Card, { CardContent } from "@/components/ui2/Card";
import Button from "@/components/ui2/Button";
import { BUYER_CATEGORY_OPTIONS } from "@/lib/categoryDisplay";
import { categoryIdToLabel } from "@/lib/categoryIds";
import { useToast, ToastContainer } from "@/components/Toast";

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
  const { showToast, toasts, removeToast } = useToast();

  const [conversations, setConversations] = useState<Conversation[]>(initialConversations);
  const [showDiscovery, setShowDiscovery] = useState(initialConversations.length === 0);
  const [selectedCategory, setSelectedCategory] = useState(initialCategoryId || "");
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // New state for Find Materials flow
  const [requestText, setRequestText] = useState("");
  const [sendMode, setSendMode] = useState<"NETWORK" | "DIRECT">("NETWORK");
  const [selectedSupplierIds, setSelectedSupplierIds] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);

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
    setSelectedSupplierIds(new Set()); // Reset selection when category changes
    if (newValue === "") {
      return;
    }
    router.push(`/buyer/suppliers/talk?categoryId=${newValue}`);
  };

  const handleSupplierToggle = (supplierId: string) => {
    const newSet = new Set(selectedSupplierIds);
    if (newSet.has(supplierId)) {
      newSet.delete(supplierId);
    } else {
      newSet.add(supplierId);
    }
    setSelectedSupplierIds(newSet);
  };

  const handleSubmitRequest = async () => {
    if (!selectedCategory || selectedCategory === "" || selectedCategory === "all") {
      showToast({ type: "error", message: "Please select a category" });
      return;
    }

    if (!requestText.trim()) {
      showToast({ type: "error", message: "Please enter your material request" });
      return;
    }

    if (sendMode === "DIRECT" && selectedSupplierIds.size === 0) {
      showToast({ type: "error", message: "Please select at least one supplier" });
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/buyer/material-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          categoryId: selectedCategory,
          requestText: requestText.trim(),
          sendMode: sendMode,
          supplierIds: sendMode === "DIRECT" ? Array.from(selectedSupplierIds) : undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to send request");
      }

      if (data.ok) {
        // Show success message
        showToast({
          type: "success",
          message: `Request sent to ${data.supplierCount} supplier${data.supplierCount !== 1 ? "s" : ""}`,
        });

        // Reset form
        setRequestText("");
        setSelectedSupplierIds(new Set());
        setShowDiscovery(false);

        // Refresh conversations list
        fetch("/api/buyer/suppliers/conversations")
          .then((res) => res.json())
          .then((convData) => {
            if (convData.ok && convData.conversations) {
              setConversations(convData.conversations || []);
            }
          })
          .catch((err) => {
            console.error("Error refreshing conversations:", err);
          });

        // Redirect to material request detail page
        if (data.materialRequestId) {
          router.push(`/buyer/material-requests/${data.materialRequestId}`);
        } else {
          // Fallback to messages if no materialRequestId (shouldn't happen)
          router.push("/buyer/suppliers/talk");
        }
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to send request";
      setError(errorMessage);
      showToast({ type: "error", message: errorMessage });
    } finally {
      setSubmitting(false);
    }
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
    <>
      <ToastContainer toasts={toasts} onRemove={removeToast} />
      <div className="flex h-full overflow-hidden">
      {/* Left: Conversations List */}
      <div className={`w-full md:w-64 border-r border-zinc-200 dark:border-zinc-800 overflow-y-auto bg-white dark:bg-zinc-900 flex-shrink-0 ${showDiscovery ? "hidden md:block" : "block"}`}>
        <div className="p-4 border-b border-zinc-200 dark:border-zinc-800">
          <h2 className="text-sm font-semibold text-black dark:text-zinc-50 mb-3">
            Messages
          </h2>
          <Button
            onClick={() => setShowDiscovery(true)}
            className="w-full text-sm"
            variant="primary"
          >
            New message
          </Button>
        </div>
        <div className="p-3 pt-4">
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
                <Card className="mb-2.5 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors">
                  <CardContent className="p-3.5">
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-full bg-zinc-200 dark:bg-zinc-700 flex items-center justify-center flex-shrink-0">
                        <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                          {conv.supplierName.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <div className="text-sm font-semibold text-black dark:text-zinc-50 truncate flex-1">
                            {conv.supplierName}
                          </div>
                          {conv.unreadCount && conv.unreadCount > 0 && (
                            <div className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-500 text-white text-xs font-semibold flex items-center justify-center">
                              {conv.unreadCount > 9 ? "9+" : conv.unreadCount}
                            </div>
                          )}
                        </div>
                        <div className="text-xs text-zinc-500 dark:text-zinc-400 truncate mb-1">
                          {conv.lastMessagePreview}
                        </div>
                        <div className="text-xs text-zinc-400 dark:text-zinc-500">
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
                Find Materials
              </h1>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                Select a category and describe what you need
              </p>
            </div>

            {/* Category Dropdown */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-black dark:text-zinc-50 mb-2">
                Category
              </label>
              <select
                value={selectedCategory}
                onChange={(e) => handleCategoryChange(e.target.value)}
                className="w-full max-w-md px-4 py-2 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-black dark:text-zinc-50 focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-zinc-50"
              >
                <option value="" disabled>
                  Select a category...
                </option>
                {CATEGORIES.filter((c) => c.id !== "all").map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Request Text Area - Show after category is selected */}
            {selectedCategory && selectedCategory !== "" && selectedCategory !== "all" && (
              <>
                <div className="mb-6">
                  <label className="block text-sm font-medium text-black dark:text-zinc-50 mb-2">
                    What materials do you need?
                  </label>
                  <textarea
                    value={requestText}
                    onChange={(e) => setRequestText(e.target.value)}
                    placeholder="Describe the materials you're looking for, quantities, delivery requirements, etc."
                    rows={6}
                    className="w-full max-w-2xl px-4 py-3 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-black dark:text-zinc-50 focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-zinc-50 resize-none"
                  />
                </div>

                {/* Send Mode Toggle */}
                <div className="mb-6">
                  <label className="block text-sm font-medium text-black dark:text-zinc-50 mb-2">
                    Send to
                  </label>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="sendMode"
                        value="NETWORK"
                        checked={sendMode === "NETWORK"}
                        onChange={(e) => {
                          setSendMode("NETWORK");
                          setSelectedSupplierIds(new Set());
                        }}
                        className="w-4 h-4"
                      />
                      <span className="text-sm text-black dark:text-zinc-50">
                        Send to entire network
                      </span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="sendMode"
                        value="DIRECT"
                        checked={sendMode === "DIRECT"}
                        onChange={(e) => setSendMode("DIRECT")}
                        className="w-4 h-4"
                      />
                      <span className="text-sm text-black dark:text-zinc-50">
                        Choose suppliers directly
                      </span>
                    </label>
                  </div>
                </div>
              </>
            )}

            {/* Supplier List - Only show in DIRECT mode after category and request text are entered */}
            {selectedCategory && selectedCategory !== "" && selectedCategory !== "all" && sendMode === "DIRECT" ? (
              <>
                {loading ? (
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
                  <>
                    <div className="mb-4">
                      <label className="block text-sm font-medium text-black dark:text-zinc-50 mb-2">
                        Select suppliers ({selectedSupplierIds.size} selected)
                      </label>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                      {suppliers.map((supplier) => {
                        const isSelected = selectedSupplierIds.has(supplier.id);
                        return (
                          <button
                            key={supplier.id}
                            onClick={() => handleSupplierToggle(supplier.id)}
                            className="text-left"
                          >
                            <Card
                              className={`cursor-pointer transition-colors ${
                                isSelected
                                  ? "bg-zinc-100 dark:bg-zinc-800 border-2 border-black dark:border-zinc-50"
                                  : "hover:bg-zinc-50 dark:hover:bg-zinc-900"
                              }`}
                            >
                              <CardContent className="p-6">
                                <div className="flex items-start gap-3">
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={() => handleSupplierToggle(supplier.id)}
                                    className="mt-1 w-4 h-4"
                                    onClick={(e) => e.stopPropagation()}
                                  />
                                  <div className="flex-1">
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
                                </div>
                              </CardContent>
                            </Card>
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
                {/* Submit Button */}
                <div className="mb-6">
                  <Button
                    onClick={handleSubmitRequest}
                    disabled={submitting || !requestText.trim() || selectedSupplierIds.size === 0}
                    variant="primary"
                    className="w-full max-w-md"
                  >
                    {submitting ? "Sending..." : "Send Request"}
                  </Button>
                </div>
              </>
            ) : selectedCategory && selectedCategory !== "" && selectedCategory !== "all" && sendMode === "NETWORK" ? (
              /* Submit Button for NETWORK mode */
              <div className="mb-6">
                <Button
                  onClick={handleSubmitRequest}
                  disabled={submitting || !requestText.trim()}
                  variant="primary"
                  className="w-full max-w-md"
                >
                  {submitting ? "Sending..." : "Send Request"}
                </Button>
              </div>
            ) : showEmptyState ? (
              <div className="text-center py-12">
                <p className="text-zinc-600 dark:text-zinc-400 mb-2">
                  Please select a category to get started
                </p>
                <p className="text-sm text-zinc-500 dark:text-zinc-500">
                  Choose a category from the dropdown above to see available suppliers in that category.
                </p>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="text-center max-w-md px-6">
              <h3 className="text-lg font-semibold text-black dark:text-zinc-50 mb-2">
                Select a conversation
              </h3>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                Choose an existing supplier conversation from the left, or start a new request.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
    </>
  );
}
