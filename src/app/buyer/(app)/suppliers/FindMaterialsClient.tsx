"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
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

  // Get initial category and query from URL params (dashboard → Find Materials flow)
  const initialCategoryId = searchParams.get("categoryId") || "";
  const normalizedCategoryId = initialCategoryId.toLowerCase();
  const initialQuery = searchParams.get("q") || "";

  const [selectedCategory, setSelectedCategory] = useState(normalizedCategoryId);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requestText, setRequestText] = useState(initialQuery);
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

  // Sync request text from URL when search params change (e.g. navigation from dashboard with q)
  useEffect(() => {
    const q = searchParams.get("q") || "";
    setRequestText(q);
  }, [searchParams]);

  const handleCategoryChange = (newValue: string) => {
    setSelectedCategory(newValue);
    setSelectedSupplierIds(new Set());
    if (newValue === "") {
      return;
    }
    const q = requestText.trim();
    const url = q
      ? `/buyer/suppliers?categoryId=${newValue}&q=${encodeURIComponent(q)}`
      : `/buyer/suppliers?categoryId=${newValue}`;
    router.push(url, { scroll: false });
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
        showToast({
          type: "success",
          message: `Request sent to ${data.supplierCount} supplier${data.supplierCount !== 1 ? "s" : ""}`,
        });
        setRequestText("");
        setSelectedSupplierIds(new Set());
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
  const hasCategory = selectedCategory && selectedCategory !== "" && selectedCategory !== "all";

  return (
    <>
      <ToastContainer toasts={toasts} onRemove={removeToast} />
      <div className="flex flex-1 px-6 py-8">
        <div className="w-full max-w-6xl mx-auto space-y-8">
          {/* Step context */}
          <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-2">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-1">
                Step 2 of 2
              </p>
              <h1 className="text-2xl sm:text-3xl font-semibold text-black dark:text-zinc-50 tracking-tight">
                Review your request
              </h1>
            </div>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Review & Send
            </p>
          </div>

          {/* A. Request Details – hero-style card (continuation of dashboard) */}
          <Card className="border-zinc-200 dark:border-zinc-700 shadow-md shadow-zinc-200/50 dark:shadow-zinc-900/50">
            <CardContent className="p-8 sm:p-10">
              <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-6">
                Agora will route this through the supplier network based on your selected category.
              </p>
              <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-700 dark:text-zinc-300 mb-4">
                Request details
              </h2>
              <div className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-black dark:text-zinc-50 mb-2">
                    Category
                  </label>
                  <select
                    value={selectedCategory}
                    onChange={(e) => handleCategoryChange(e.target.value)}
                    className="w-full max-w-md px-4 py-2.5 border border-zinc-300 dark:border-zinc-600 rounded-lg bg-white dark:bg-zinc-900 text-black dark:text-zinc-50 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent"
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
                {hasCategory && (
                  <div>
                    <label className="block text-sm font-medium text-black dark:text-zinc-50 mb-2">
                      What materials do you need?
                    </label>
                    <textarea
                      value={requestText}
                      onChange={(e) => setRequestText(e.target.value)}
                      placeholder="Add details, quantities, delivery requirements, or refine your request..."
                      rows={5}
                      className="w-full max-w-2xl px-4 py-3 border border-zinc-300 dark:border-zinc-600 rounded-lg bg-white dark:bg-zinc-900 text-black dark:text-zinc-50 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent resize-none"
                    />
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {showEmptyState && (
            <div className="text-center py-12 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50/50 dark:bg-zinc-800/30">
              <p className="text-zinc-600 dark:text-zinc-400 mb-2">
                Please select a category to get started
              </p>
              <p className="text-sm text-zinc-500 dark:text-zinc-500">
                Choose a category from the dropdown above to see routing options and suppliers.
              </p>
            </div>
          )}

          {hasCategory && (
            <>
              {/* B. Routing Options */}
              <Card>
                <CardContent className="p-6 sm:p-8">
                  <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-700 dark:text-zinc-300 mb-4">
                    How should Agora route this?
                  </h2>
                  <div className="flex flex-col sm:flex-row gap-4">
                    <label
                      className={`flex items-start gap-4 p-4 rounded-lg border-2 cursor-pointer transition-colors ${
                        sendMode === "NETWORK"
                          ? "border-slate-600 dark:border-slate-400 bg-slate-50/50 dark:bg-slate-900/30"
                          : "border-zinc-200 dark:border-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-600"
                      }`}
                    >
                      <input
                        type="radio"
                        name="sendMode"
                        value="NETWORK"
                        checked={sendMode === "NETWORK"}
                        onChange={() => {
                          setSendMode("NETWORK");
                          setSelectedSupplierIds(new Set());
                        }}
                        className="mt-1 w-4 h-4"
                      />
                      <div>
                        <span className="font-medium text-black dark:text-zinc-50 block">
                          Send to entire network
                        </span>
                        {!loading && !error && suppliers.length > 0 && (
                          <span className="text-sm text-zinc-600 dark:text-zinc-400 mt-0.5 block">
                            {suppliers.length} supplier{suppliers.length !== 1 ? "s" : ""} in this category
                          </span>
                        )}
                        {loading && (
                          <span className="text-sm text-zinc-500 dark:text-zinc-500 mt-0.5 block">
                            Loading...
                          </span>
                        )}
                      </div>
                    </label>
                    <label
                      className={`flex items-start gap-4 p-4 rounded-lg border-2 cursor-pointer transition-colors ${
                        sendMode === "DIRECT"
                          ? "border-slate-600 dark:border-slate-400 bg-slate-50/50 dark:bg-slate-900/30"
                          : "border-zinc-200 dark:border-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-600"
                      }`}
                    >
                      <input
                        type="radio"
                        name="sendMode"
                        value="DIRECT"
                        checked={sendMode === "DIRECT"}
                        onChange={() => setSendMode("DIRECT")}
                        className="mt-1 w-4 h-4"
                      />
                      <div>
                        <span className="font-medium text-black dark:text-zinc-50 block">
                          Choose suppliers directly
                        </span>
                        <span className="text-sm text-zinc-600 dark:text-zinc-400 mt-0.5 block">
                          Select who receives this request
                        </span>
                      </div>
                    </label>
                  </div>
                </CardContent>
              </Card>

              {/* C. Suppliers receiving this request */}
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-700 dark:text-zinc-300 mb-4">
                  Suppliers receiving this request
                  {!loading && !error && suppliers.length > 0 && (
                    <span className="normal-case font-normal text-zinc-600 dark:text-zinc-400 ml-2">
                      ({suppliers.length})
                    </span>
                  )}
                </h2>

                {loading && (
                  <div className="py-10 text-center text-zinc-600 dark:text-zinc-400 text-sm">
                    Loading suppliers...
                  </div>
                )}
                {error && (
                  <div className="py-10 text-center text-red-600 dark:text-red-400 text-sm">
                    Error: {error}
                  </div>
                )}
                {showNoSuppliers && (
                  <div className="py-10 text-center text-zinc-600 dark:text-zinc-400 text-sm">
                    No suppliers found in this category
                  </div>
                )}

                {!loading && !error && suppliers.length > 0 && sendMode === "NETWORK" && (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {suppliers.map((supplier) => (
                      <Card key={supplier.id} className="bg-zinc-50/80 dark:bg-zinc-800/50 border-zinc-200 dark:border-zinc-700">
                        <CardContent className="p-4">
                          <h3 className="text-sm font-semibold text-black dark:text-zinc-50">
                            {supplier.name}
                          </h3>
                          {supplier.categories.length > 0 && (
                            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                              {supplier.categories
                                .map((cat) => categoryIdToLabel[cat as keyof typeof categoryIdToLabel] || cat)
                                .join(", ")}
                            </p>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}

                {!loading && !error && suppliers.length > 0 && sendMode === "DIRECT" && (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {suppliers.map((supplier) => {
                      const isSelected = selectedSupplierIds.has(supplier.id);
                      return (
                        <button
                          key={supplier.id}
                          type="button"
                          onClick={() => handleSupplierToggle(supplier.id)}
                          className="text-left"
                        >
                          <Card
                            className={`transition-colors ${
                              isSelected
                                ? "bg-zinc-100 dark:bg-zinc-800 border-2 border-slate-600 dark:border-slate-400"
                                : "border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                            }`}
                          >
                            <CardContent className="p-4">
                              <div className="flex items-start gap-3">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => handleSupplierToggle(supplier.id)}
                                  className="mt-1 w-4 h-4 shrink-0"
                                  onClick={(e) => e.stopPropagation()}
                                />
                                <div className="min-w-0">
                                  <h3 className="text-sm font-semibold text-black dark:text-zinc-50">
                                    {supplier.name}
                                  </h3>
                                  {supplier.categories.length > 0 && (
                                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                                      {supplier.categories
                                        .map((cat) => categoryIdToLabel[cat as keyof typeof categoryIdToLabel] || cat)
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
                )}
              </div>

              {/* D. Submit actions */}
              {hasCategory && (
                <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-4 pt-2 border-t border-zinc-200 dark:border-zinc-700">
                  <Link
                    href="/buyer/dashboard"
                    className="text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-50 transition-colors"
                  >
                    Edit Search
                  </Link>
                  <div className="sm:min-w-[200px]">
                    <Button
                      onClick={handleSubmitRequest}
                      disabled={
                        submitting ||
                        !requestText.trim() ||
                        (sendMode === "DIRECT" && selectedSupplierIds.size === 0)
                      }
                      variant="primary"
                      className="w-full sm:w-auto"
                    >
                      {submitting ? "Sending..." : "Send Request"}
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
