"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Card, { CardContent } from "@/components/ui2/Card";
import Button from "@/components/ui2/Button";
import { BUYER_CATEGORY_OPTIONS } from "@/lib/categoryDisplay";
import { categoryIdToLabel } from "@/lib/categoryIds";
import { useToast, ToastContainer } from "@/components/Toast";

const CATEGORIES = [
  { id: "all", label: "All Categories" },
  ...BUYER_CATEGORY_OPTIONS,
];

interface Supplier {
  id: string;
  name: string;
  categories: string[];
}

export default function FindMaterialsClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showToast, toasts, removeToast } = useToast();

  // Get initial category from URL params
  const initialCategoryId = searchParams.get("categoryId") || "";
  const normalizedCategoryId = initialCategoryId.toLowerCase();

  const [selectedCategory, setSelectedCategory] = useState(normalizedCategoryId);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requestText, setRequestText] = useState("");
  const [sendMode, setSendMode] = useState<"NETWORK" | "DIRECT">("NETWORK");
  const [selectedSupplierIds, setSelectedSupplierIds] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);

  // Fetch suppliers when selectedCategory changes
  useEffect(() => {
    if (selectedCategory === "" || selectedCategory === "all") {
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
  }, [selectedCategory]);

  const handleCategoryChange = (newValue: string) => {
    setSelectedCategory(newValue);
    setSelectedSupplierIds(new Set()); // Reset selection when category changes
    if (newValue === "") {
      return;
    }
    // Update URL without navigation
    router.push(`/buyer/suppliers?categoryId=${newValue}`, { scroll: false });
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

        // Redirect to material request detail page
        if (data.materialRequestId) {
          router.push(`/buyer/material-requests/${data.materialRequestId}`);
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

  const showNoSuppliers = !loading && !error && suppliers.length === 0 && selectedCategory !== "" && selectedCategory !== "all";
  const showEmptyState = selectedCategory === "" || selectedCategory === "all";

  return (
    <>
      <ToastContainer toasts={toasts} onRemove={removeToast} />
      <div className="flex flex-1 px-6 py-8">
        <div className="w-full max-w-6xl mx-auto">
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
                      {!loading && !error && suppliers.length > 0 && (
                        <span className="text-zinc-500 dark:text-zinc-400 ml-1">
                          ({suppliers.length} supplier{suppliers.length !== 1 ? "s" : ""})
                        </span>
                      )}
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
            <>
              {/* NETWORK Supplier List - Read-only */}
              {loading ? (
                <div className="mb-6">
                  <div className="text-sm font-medium text-black dark:text-zinc-50 mb-3">
                    This request will be sent to
                  </div>
                  <div className="text-center py-8 text-zinc-600 dark:text-zinc-400">
                    Loading suppliers...
                  </div>
                </div>
              ) : error ? (
                <div className="mb-6">
                  <div className="text-sm font-medium text-black dark:text-zinc-50 mb-3">
                    This request will be sent to
                  </div>
                  <div className="text-center py-8 text-red-600 dark:text-red-400">
                    Error: {error}
                  </div>
                </div>
              ) : showNoSuppliers ? (
                <div className="mb-6">
                  <div className="text-sm font-medium text-black dark:text-zinc-50 mb-3">
                    This request will be sent to
                  </div>
                  <div className="text-center py-8 text-zinc-600 dark:text-zinc-400">
                    No suppliers found in this category
                  </div>
                </div>
              ) : suppliers.length > 0 ? (
                <div className="mb-6">
                  <div className="text-sm font-medium text-black dark:text-zinc-50 mb-3">
                    This request will be sent to {suppliers.length} supplier{suppliers.length !== 1 ? "s" : ""}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {suppliers.map((supplier) => (
                      <Card
                        key={supplier.id}
                        className="bg-zinc-50 dark:bg-zinc-900"
                      >
                        <CardContent className="p-4">
                          <h3 className="text-sm font-semibold text-black dark:text-zinc-50">
                            {supplier.name}
                          </h3>
                          {supplier.categories.length > 0 && (
                            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
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
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              ) : null}
              {/* Submit Button for NETWORK mode */}
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
            </>
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
      </div>
    </>
  );
}

