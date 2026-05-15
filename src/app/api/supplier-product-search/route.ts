import { NextResponse } from "next/server";
import { findSupplierSearchAdapter } from "@/lib/suppliers/registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/supplier-product-search?supplierId=...&q=...
 * Returns automated product/search results for suppliers where we have an adapter.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const supplierId = searchParams.get("supplierId") ?? "";
  const q = searchParams.get("q") ?? "";

  if (!supplierId.trim() || !q.trim()) {
    return NextResponse.json({ results: [] });
  }

  const adapter = findSupplierSearchAdapter(supplierId);
  if (adapter) {
    const results = await adapter.search(q);
    return NextResponse.json({
      supplierId,
      source: adapter.apiSource,
      results: results.filter((r) => r.supplierId === supplierId),
    });
  }

  return NextResponse.json({
    supplierId,
    source: "MANUAL_OR_CAPABILITY_ONLY",
    results: [],
  });
}
