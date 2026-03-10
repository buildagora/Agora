"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { MATERIAL_CATEGORIES } from "@/lib/categoryDisplay";
import { getSupplierCoverage } from "@/lib/supplierCoverage";
import Card, { CardContent, CardHeader } from "@/components/ui2/Card";
import Button from "@/components/ui2/Button";
import Badge from "@/components/ui2/Badge";
import Input from "@/components/ui2/Input";

interface Supplier {
  id: string;
  companyName: string;
  email: string;
  categoriesServed?: string[];
  coverage?: {
    categories: string[];
    fulfills: string[];
    serviceZipPrefixes?: string[];
  };
}

export default function FindMaterialsPage() {
  const router = useRouter();
  // NEW FOUNDATION: AuthGuard handles auth/role checks - no need to check user here
  const [materialDescription, setMaterialDescription] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [location, setLocation] = useState("");
  const [urgency, setUrgency] = useState<"low" | "medium" | "high">("medium");
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // NEW FOUNDATION: AuthGuard handles auth/role checks
  // This page only needs to check if user is available for data loading

  const handleSearch = () => {
    if (!selectedCategory) {
      return;
    }

    setIsSearching(true);

    // TODO: Load sellers from database API
    // For now, return empty results
    const allSellers: Array<{ id: string; role: string; companyName?: string; email: string; categoriesServed?: string[] }> = [];

    // Match suppliers by category
    const matchedSuppliers: Supplier[] = [];

    for (const seller of allSellers) {
      const coverage = getSupplierCoverage(seller.id);
      
      // Check if seller serves this category
      let servesCategory = false;
      if (coverage) {
        servesCategory = coverage.categories.includes(selectedCategory);
      } else if (seller.categoriesServed && Array.isArray(seller.categoriesServed)) {
        // Fallback to legacy categoriesServed
        servesCategory = seller.categoriesServed.includes(selectedCategory);
      }

      if (servesCategory) {
        matchedSuppliers.push({
          id: seller.id,
          companyName: seller.companyName || seller.email,
          email: seller.email,
          categoriesServed: seller.categoriesServed,
          coverage: coverage ? {
            categories: coverage.categories,
            fulfills: coverage.fulfills || [],
            serviceZipPrefixes: coverage.serviceZipPrefixes,
          } : undefined,
        });
      }
    }

    // Sort suppliers (could add more sophisticated ranking later)
    matchedSuppliers.sort((a, b) => {
      // Prefer suppliers with coverage profiles
      if (a.coverage && !b.coverage) return -1;
      if (!a.coverage && b.coverage) return 1;
      return a.companyName.localeCompare(b.companyName);
    });

    setSuppliers(matchedSuppliers);
    setIsSearching(false);
  };

  const getSupplierType = (supplier: Supplier): "wholesale" | "retail" | "local" => {
    // Simple heuristic: if has coverage profile with delivery, likely wholesale
    // If has pickup only, likely retail/local
    if (supplier.coverage) {
      if (supplier.coverage.fulfills.includes("delivery")) {
        return "wholesale";
      }
      if (supplier.coverage.fulfills.includes("pickup")) {
        return "local";
      }
    }
    // Default to local if unknown
    return "local";
  };

  const getSupplierTypeLabel = (type: "wholesale" | "retail" | "local"): string => {
    switch (type) {
      case "wholesale":
        return "Wholesale Supplier";
      case "retail":
        return "Retail Supplier";
      case "local":
        return "Local Supplier";
    }
  };

  return (
    <div className="flex flex-1 px-6 py-8">
        <div className="w-full max-w-6xl mx-auto space-y-6">
          {/* Page Header */}
          <div className="mb-8">
            <div className="flex items-start justify-between mb-2">
              <div>
                <h1 className="text-3xl font-semibold text-black dark:text-zinc-50 mb-2">
                  Supplier Discovery
                </h1>
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                  Discover suppliers in your area. Browse options without creating a request.
                </p>
              </div>
              <Link href="/buyer/dashboard">
                <Button variant="outline" size="md">
                  Back
                </Button>
              </Link>
            </div>
          </div>

          {/* Search Form Card */}
          <Card>
            <CardHeader>
              <h2 className="text-xl font-semibold text-black dark:text-zinc-50">
                What are you looking for?
              </h2>
            </CardHeader>
            <CardContent className="space-y-4">
              <Input
                label="Material Description (optional)"
                type="text"
                value={materialDescription}
                onChange={(e) => setMaterialDescription(e.target.value)}
                placeholder="e.g., 2x4 lumber, shingles, pipe fittings..."
              />

              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  Category <span className="text-red-500">*</span>
                </label>
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-black dark:text-zinc-50 focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-zinc-50 focus:border-transparent"
                >
                  <option value="">Select a category</option>
                  {MATERIAL_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  label="Location (optional)"
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="City, ZIP, or region"
                />

                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                    Urgency (optional)
                  </label>
                  <select
                    value={urgency}
                    onChange={(e) => setUrgency(e.target.value as "low" | "medium" | "high")}
                    className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-black dark:text-zinc-50 focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-zinc-50 focus:border-transparent"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>
              </div>

              <Button
                variant="primary"
                size="lg"
                className="w-full"
                onClick={handleSearch}
                disabled={!selectedCategory || isSearching}
              >
                {isSearching ? "Searching..." : "Find Suppliers"}
              </Button>
            </CardContent>
          </Card>

          {/* Results */}
          {suppliers.length > 0 && (
            <div>
              <h2 className="text-xl font-semibold text-black dark:text-zinc-50 mb-4">
                Found {suppliers.length} {suppliers.length === 1 ? "supplier" : "suppliers"}
              </h2>

              <div className="flex flex-col gap-4">
                {suppliers.map((supplier) => {
                  const supplierType = getSupplierType(supplier);
                  return (
                    <Card key={supplier.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors">
                      <CardContent className="p-5">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-2">
                              <h3 className="font-semibold text-black dark:text-zinc-50">
                                {supplier.companyName}
                              </h3>
                              <Badge variant="info">
                                {getSupplierTypeLabel(supplierType)}
                              </Badge>
                            </div>
                            <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-3">
                              {supplier.email}
                            </p>
                            {supplier.categoriesServed && supplier.categoriesServed.length > 0 && (
                              <div className="flex flex-wrap gap-2">
                                {supplier.categoriesServed.slice(0, 5).map((cat) => (
                                  <Badge key={cat} variant="default">
                                    {cat}
                                  </Badge>
                                ))}
                                {supplier.categoriesServed.length > 5 && (
                                  <span className="text-xs text-zinc-500 dark:text-zinc-500 self-center">
                                    +{supplier.categoriesServed.length - 5} more
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                          <div className="flex-shrink-0">
                            <Button
                              variant="outline"
                              size="md"
                              onClick={() => {
                                // Navigate to procurement flow with this supplier pre-selected
                                router.push(`/buyer/rfqs/new?preferredSeller=${supplier.id}&category=${selectedCategory}`);
                              }}
                            >
                              Request Quote
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}

          {suppliers.length === 0 && !isSearching && (
            <Card>
              <CardContent className="p-12">
                <div className="text-center">
                  <p className="text-zinc-600 dark:text-zinc-400">
                    Enter a category and click "Find Suppliers" to discover options in your area.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
  );
}

