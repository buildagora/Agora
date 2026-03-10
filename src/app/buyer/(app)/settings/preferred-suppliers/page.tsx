"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/AuthProvider";
import { CATEGORY_OPTIONS } from "@/lib/categoryDisplay";
import { categoryIdToLabel, labelToCategoryId } from "@/lib/categoryIds";
import { fetchJson } from "@/lib/clientFetch";

// TODO: Move to shared types when DB model exists
interface PreferredSupplierRule {
  ruleId?: string;
  buyerId: string;
  categoryId: string | "all";
  sellerIds: string[];
  priority?: number;
  enabled: boolean;
  updatedAt: string;
  category?: string; // Legacy field
}

export default function PreferredSuppliersPage() {
  const router = useRouter();
  const { user: currentUser, status } = useAuth();
  const [rules, setRules] = useState<PreferredSupplierRule[]>([]);
  const [sellers, setSellers] = useState<Array<{ id: string; companyName: string; displayName: string; email: string; categoriesServed: string[] }>>([]);
  const [sellersById, setSellersById] = useState<Record<string, { id: string; companyName?: string | null; fullName?: string | null; email?: string | null }>>({});
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [selectedSellerIds, setSelectedSellerIds] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingSellers, setIsLoadingSellers] = useState(false);
  const [sellersError, setSellersError] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Helper function to display seller name from sellersById map
  function displaySellerName(idOrEmail: string): string {
    const s = sellersById[idOrEmail];
    return s?.companyName || s?.fullName || s?.email || idOrEmail;
  }

  useEffect(() => {
    // Wait for auth to load
    if (status === "loading") {
      return;
    }

    if (!currentUser || currentUser.role !== "BUYER") {
      router.push("/buyer/dashboard");
      return;
    }

    // Load existing rules from API
    const loadRules = async () => {
      try {
        const result = await fetchJson("/api/buyer/preferred-suppliers", {
          method: "GET",
          credentials: "include",
        });

        if (result.ok && result.json?.ok) {
          const data = result.json.data;
          
          // Handle new shape: { rules, sellersById }
          if (data && typeof data === "object" && "rules" in data && "sellersById" in data) {
            setRules(data.rules as PreferredSupplierRule[]);
            setSellersById(data.sellersById || {});
          }
          // Handle legacy shape: array of rules
          else if (Array.isArray(data)) {
            setRules(data as PreferredSupplierRule[]);
            setSellersById({});
          } else {
            setRules([]);
            setSellersById({});
          }
        } else {
          setRules([]);
          setSellersById({});
        }
      } catch (error) {
        console.error("Failed to load preferred suppliers:", error);
        setRules([]);
        setSellersById({});
      }
    };

    loadRules();
  }, [router, currentUser, status]);

  const handleCategoryChange = async (category: string) => {
    setSelectedCategory(category);
    setSellersError(null);
    setMessage(null);

    // Load existing rule by categoryId or legacy category
    const categoryId = labelToCategoryId[category as keyof typeof labelToCategoryId] || category;
    const existingRule = rules.find((r) => 
      r.categoryId === categoryId || 
      (r.category && r.category === category)
    );
    if (existingRule) {
      setSelectedSellerIds([...existingRule.sellerIds]);
    } else {
      setSelectedSellerIds([]);
    }

    // Load sellers for this category from API
    if (category && category !== "all") {
      setIsLoadingSellers(true);
      try {
        const result = await fetchJson(`/api/sellers/by-category?categoryId=${encodeURIComponent(categoryId)}`, {
          method: "GET",
          credentials: "include",
        });

        if (result.ok && result.json) {
          const sellersData = Array.isArray(result.json) ? result.json : (result.json.data || []);
          setSellers(sellersData);
          if (sellersData.length === 0) {
            setSellersError("No suppliers currently serve this category.");
          }
        } else {
          setSellersError("Failed to load suppliers. Please try again.");
          setSellers([]);
        }
      } catch (error) {
        console.error("Failed to load sellers:", error);
        setSellersError("Failed to load suppliers. Please try again.");
        setSellers([]);
      } finally {
        setIsLoadingSellers(false);
      }
    } else {
      // "All Categories" - load all sellers
      setIsLoadingSellers(true);
      try {
        // For "all", we could load all sellers or show empty
        // For now, show empty with a message
        setSellers([]);
        setSellersError("Select a specific category to choose preferred suppliers.");
      } finally {
        setIsLoadingSellers(false);
      }
    }
  };

  const handleSellerToggle = (sellerId: string) => {
    setSelectedSellerIds((prev) => {
      if (prev.includes(sellerId)) {
        return prev.filter((id) => id !== sellerId);
      } else {
        return [...prev, sellerId];
      }
    });
  };

  const handleSave = async () => {
    if (!currentUser || !selectedCategory) {
      return;
    }

    // Block saving when sellerIds is empty
    if (selectedSellerIds.length === 0) {
      setMessage({
        type: "error",
        text: "Select at least 1 supplier",
      });
      return;
    }

    setIsSaving(true);
    setMessage(null);

    try {
      // Save via API
      const result = await fetchJson("/api/buyer/preferred-suppliers", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          category: selectedCategory,
          categoryId: labelToCategoryId[selectedCategory as keyof typeof labelToCategoryId] || selectedCategory,
          sellerIds: selectedSellerIds,
        }),
      });

      if (result.ok && result.json?.ok) {
        // Reload rules from API
        const reloadResult = await fetchJson("/api/buyer/preferred-suppliers", {
          method: "GET",
          credentials: "include",
        });

        if (reloadResult.ok && reloadResult.json?.ok) {
          const data = reloadResult.json.data;
          
          // Handle new shape: { rules, sellersById }
          if (data && typeof data === "object" && "rules" in data && "sellersById" in data) {
            setRules(data.rules as PreferredSupplierRule[]);
            setSellersById(data.sellersById || {});
          }
          // Handle legacy shape: array of rules
          else if (Array.isArray(data)) {
            setRules(data as PreferredSupplierRule[]);
            setSellersById({});
          }
        }

        setMessage({
          type: "success",
          text: `Preferred suppliers saved for ${selectedCategory === "all" ? "all categories" : selectedCategory}`,
        });

        // Clear selection after save
        setSelectedCategory("");
        setSelectedSellerIds([]);
      } else {
        throw new Error(result.json?.message || "Failed to save preferred suppliers");
      }
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Failed to save preferred suppliers",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (category: string | "all") => {
    if (!currentUser) return;

    try {
      // Delete via API
      const result = await fetchJson("/api/buyer/preferred-suppliers", {
        method: "DELETE",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ category }),
      });

      if (result.ok && result.json?.ok) {
        // Reload rules from API
        const reloadResult = await fetchJson("/api/buyer/preferred-suppliers", {
          method: "GET",
          credentials: "include",
        });

        if (reloadResult.ok && reloadResult.json?.ok) {
          const data = reloadResult.json.data;
          
          // Handle new shape: { rules, sellersById }
          if (data && typeof data === "object" && "rules" in data && "sellersById" in data) {
            setRules(data.rules as PreferredSupplierRule[]);
            setSellersById(data.sellersById || {});
          }
          // Handle legacy shape: array of rules
          else if (Array.isArray(data)) {
            setRules(data as PreferredSupplierRule[]);
            setSellersById({});
          }
        }

        if (selectedCategory === category) {
          setSelectedCategory("");
          setSelectedSellerIds([]);
        }

        setMessage({
          type: "success",
          text: "Rule deleted",
        });
      } else {
        throw new Error(result.json?.message || "Failed to delete rule");
      }
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Failed to delete rule",
      });
    }
  };

  const handleToggleEnabled = async (category: string | "all", enabled: boolean) => {
    if (!currentUser) return;

    try {
      // Toggle via API (using POST with enabled flag)
      const result = await fetchJson("/api/buyer/preferred-suppliers", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          category,
          enabled: !enabled, // Toggle
        }),
      });

      if (result.ok && result.json?.ok) {
        // Reload rules from API
        const reloadResult = await fetchJson("/api/buyer/preferred-suppliers", {
          method: "GET",
          credentials: "include",
        });

        if (reloadResult.ok && reloadResult.json?.ok) {
          const data = reloadResult.json.data;
          
          // Handle new shape: { rules, sellersById }
          if (data && typeof data === "object" && "rules" in data && "sellersById" in data) {
            setRules(data.rules as PreferredSupplierRule[]);
            setSellersById(data.sellersById || {});
          }
          // Handle legacy shape: array of rules
          else if (Array.isArray(data)) {
            setRules(data as PreferredSupplierRule[]);
            setSellersById({});
          }
        }
      }
    } catch (error) {
      console.error("Failed to toggle rule:", error);
    }
  };

  if (!currentUser) {
    return null;
  }

  return (
    <div className="flex flex-1 px-6 py-8">
        <div className="w-full max-w-6xl mx-auto">
          <div className="mb-6">
            <h1 className="text-3xl font-semibold text-black dark:text-zinc-50">
              Preferred Suppliers
            </h1>
            <p className="text-zinc-600 dark:text-zinc-400 mt-2">
              Set preferred suppliers for each material category. These suppliers will be prioritized when routing requests.
            </p>
          </div>

          {message && (
            <div
              className={`mb-4 p-4 rounded-lg ${
                message.type === "success"
                  ? "bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-200"
                  : "bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200"
              }`}
            >
              {message.text}
            </div>
          )}

          {/* Existing Rules */}
          {rules.length > 0 && (
            <div className="mb-8">
              <h2 className="text-xl font-semibold text-black dark:text-zinc-50 mb-4">
                Current Rules
              </h2>
              <div className="space-y-3">
                {rules.map((rule) => {
                  // V1 FIX: Use ruleId for stable unique key
                  const uniqueKey = rule.ruleId || `${rule.buyerId ?? "buyer"}:${rule.categoryId || rule.category || "unknown"}:${rule.updatedAt}`;
                  
                  return (
                  <div
                    key={uniqueKey}
                    className="p-4 border border-zinc-200 dark:border-zinc-800 rounded-lg"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        {/* V1 FIX: Display label but use categoryId internally */}
                        <span className="font-semibold text-black dark:text-zinc-50">
                          {rule.categoryId === "all" 
                            ? "All Categories" 
                            : (rule.categoryId 
                                ? categoryIdToLabel[rule.categoryId as keyof typeof categoryIdToLabel] || rule.categoryId
                                : (rule.category === "all" ? "All Categories" : rule.category))}
                        </span>
                        <span className="ml-2 text-sm text-zinc-600 dark:text-zinc-400">
                          ({rule.sellerIds.length} supplier{rule.sellerIds.length !== 1 ? "s" : ""})
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={rule.enabled}
                            onChange={() => {
                              // V1 FIX: Use categoryId or fallback to category for legacy
                              const categoryKey = rule.categoryId || rule.category || "all";
                              handleToggleEnabled(categoryKey, rule.enabled);
                            }}
                            className="w-4 h-4 text-black border-zinc-300 dark:border-zinc-700 rounded focus:ring-black dark:focus:ring-zinc-50"
                          />
                          <span className="text-sm text-zinc-600 dark:text-zinc-400">
                            {rule.enabled ? "Enabled" : "Disabled"}
                          </span>
                        </label>
                        <button
                          onClick={() => {
                            // V1 FIX: Use categoryId or fallback to category for legacy
                            const categoryKey = rule.categoryId || rule.category || "all";
                            handleDelete(categoryKey);
                          }}
                          className="text-sm text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                    {rule.sellerIds.length > 0 && (
                      <div className="text-sm text-zinc-600 dark:text-zinc-400">
                        <span className="font-medium">Suppliers:</span>{" "}
                        <div className="flex flex-wrap gap-2 mt-1">
                          {rule.sellerIds.map((sellerId) => (
                            <span
                              key={sellerId}
                              className="inline-flex items-center px-2 py-1 rounded-md bg-zinc-100 dark:bg-zinc-800 text-xs"
                            >
                              {displaySellerName(sellerId)}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Add/Edit Rule */}
          <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-6">
            <h2 className="text-xl font-semibold text-black dark:text-zinc-50 mb-4">
              {selectedCategory ? "Edit Rule" : "Add New Rule"}
            </h2>

            <div className="space-y-4">
              {/* Category Selection */}
              <div>
                <label className="block text-sm font-medium text-black dark:text-zinc-50 mb-2">
                  Category
                </label>
                <select
                  value={selectedCategory}
                  onChange={(e) => handleCategoryChange(e.target.value)}
                  className="w-full px-4 py-2 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-black dark:text-zinc-50 focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-zinc-50"
                >
                  <option value="">Select a category...</option>
                  <option value="all">All Categories</option>
                  {CATEGORY_OPTIONS.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Seller Selection */}
              {selectedCategory && (
                <div>
                  <label className="block text-sm font-medium text-black dark:text-zinc-50 mb-2">
                    Preferred Suppliers
                  </label>
                  {isLoadingSellers ? (
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                      Loading suppliers...
                    </p>
                  ) : sellersError ? (
                    <p className="text-sm text-red-600 dark:text-red-400">
                      {sellersError}
                    </p>
                  ) : sellers.length === 0 ? (
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                      No suppliers currently serve this category.
                    </p>
                  ) : (
                    <div className="border border-zinc-300 dark:border-zinc-700 rounded-lg p-4 max-h-64 overflow-y-auto bg-white dark:bg-zinc-900">
                      <div className="flex flex-col gap-2">
                        {sellers.map((seller) => (
                          <label
                            key={seller.id}
                            className="flex items-center gap-2 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800 p-2 rounded"
                          >
                            <input
                              type="checkbox"
                              checked={selectedSellerIds.includes(seller.id)}
                              onChange={() => handleSellerToggle(seller.id)}
                              className="w-4 h-4 text-black border-zinc-300 dark:border-zinc-700 rounded focus:ring-black dark:focus:ring-zinc-50"
                            />
                            <div className="flex-1">
                              <span className="text-sm font-medium text-black dark:text-zinc-50">
                                {seller.displayName || seller.companyName}
                              </span>
                              {seller.categoriesServed && seller.categoriesServed.length > 0 && (
                                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                                  Serves {seller.categoriesServed.length} categor{seller.categoriesServed.length !== 1 ? "ies" : "y"}
                                </p>
                              )}
                            </div>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Save Button */}
              {selectedCategory && (
                <div className="flex gap-2">
                  <button
                    onClick={handleSave}
                    disabled={isSaving}
                    className="px-6 py-2 bg-black text-white rounded-lg hover:bg-zinc-800 dark:bg-zinc-50 dark:text-black dark:hover:bg-zinc-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSaving ? "Saving..." : "Save"}
                  </button>
                  {selectedCategory && (
                    <button
                      onClick={() => {
                        setSelectedCategory("");
                        setSelectedSellerIds([]);
                        setMessage(null);
                      }}
                      className="px-6 py-2 border border-zinc-300 dark:border-zinc-700 rounded-lg text-black dark:text-zinc-50 hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
  );
}

