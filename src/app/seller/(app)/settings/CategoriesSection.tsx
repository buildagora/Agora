"use client";

import { useState, useEffect } from "react";
import Card, { CardContent, CardHeader } from "@/components/ui2/Card";
import Button from "@/components/ui2/Button";
import { fetchJson } from "@/lib/clientFetch";
import { CATEGORY_OPTIONS } from "@/lib/categoryDisplay";
import type { CategoryId } from "@/lib/categoryIds";

interface CategoriesSectionProps {
  className?: string;
}

export default function CategoriesSection({ className }: CategoriesSectionProps) {
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<Set<CategoryId>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Load current categories
  useEffect(() => {
    const loadCategories = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const result = await fetchJson("/api/seller/settings/categories", {
          method: "GET",
          credentials: "include",
        });

        if (result.ok && result.json?.ok) {
          const categoryIds = result.json.data?.categoryIds || [];
          setSelectedCategoryIds(new Set(categoryIds as CategoryId[]));
        } else {
          setError("Failed to load categories");
        }
      } catch (err) {
        console.error("Failed to load categories:", err);
        setError("Failed to load categories");
      } finally {
        setIsLoading(false);
      }
    };

    loadCategories();
  }, []);

  const handleCategoryToggle = (categoryId: CategoryId) => {
    setSelectedCategoryIds((prev) => {
      const next = new Set(prev);
      if (next.has(categoryId)) {
        next.delete(categoryId);
      } else {
        next.add(categoryId);
      }
      return next;
    });
    setSuccess(false);
  };

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    setSuccess(false);

    try {
      const result = await fetchJson("/api/seller/settings/categories", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          categoryIds: Array.from(selectedCategoryIds),
        }),
      });

      if (result.ok && result.json?.ok) {
        setSuccess(true);
        // Update selected categories from response
        const categoryIds = result.json.data?.categoryIds || [];
        setSelectedCategoryIds(new Set(categoryIds as CategoryId[]));
      } else {
        setError(result.json?.message || "Failed to save categories");
      }
    } catch (err) {
      console.error("Failed to save categories:", err);
      setError("Failed to save categories");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card className={className}>
      <CardHeader>
        <h2 className="text-xl font-semibold text-black dark:text-zinc-50">
          Categories Served
        </h2>
      </CardHeader>
      <CardContent>
        <p className="text-zinc-600 dark:text-zinc-400 mb-4 text-sm">
          Select the material categories your organization serves. You'll receive RFQ notifications for all selected categories.
        </p>

        {isLoading ? (
          <div className="text-zinc-600 dark:text-zinc-400">Loading categories...</div>
        ) : (
          <>
            <div className="space-y-2 mb-6">
              {CATEGORY_OPTIONS.map((option) => {
                const isSelected = selectedCategoryIds.has(option.id);
                return (
                  <label
                    key={option.id}
                    className="flex items-center space-x-3 p-3 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-900 cursor-pointer transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => handleCategoryToggle(option.id)}
                      className="w-4 h-4 text-orange-600 border-zinc-300 rounded focus:ring-orange-500 dark:border-zinc-700 dark:bg-zinc-800"
                    />
                    <span className="text-sm font-medium text-black dark:text-zinc-50">
                      {option.label}
                    </span>
                  </label>
                );
              })}
            </div>

            {error && (
              <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
              </div>
            )}

            {success && (
              <div className="mb-4 p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
                <p className="text-sm text-green-600 dark:text-green-400">
                  Categories saved successfully
                </p>
              </div>
            )}

            <Button
              variant="primary"
              onClick={handleSave}
              disabled={isSaving}
            >
              {isSaving ? "Saving..." : "Save Categories"}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}



