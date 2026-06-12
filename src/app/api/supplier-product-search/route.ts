import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/db.server";
import { enrichSupplierProductSearchResponse } from "@/lib/suppliers/capability/capabilityProfileDisplay";
import { resolveSupplierProductSource } from "@/lib/suppliers/capability/resolveSupplierProductSource";
import { findSupplierSearchAdapter } from "@/lib/suppliers/registry";
import { searchSupplierDiscoveryForSupplier } from "@/lib/suppliers/resolveSupplierDiscovery";
import { logAdapterBypassObservation } from "@/lib/suppliers/routing/extractionTelemetry";
import { isApiPrewarmOrchestratorFirst } from "@/lib/suppliers/routing/promotedOrchestratorRouting";
import { getDomainPlatformConfig } from "@/lib/suppliers/supplierDomainPlatformConfig";

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

  const prisma = getPrisma();
  const supplier = await prisma.supplier.findUnique({
    where: { id: supplierId },
    select: { domain: true },
  });

  const adapter = findSupplierSearchAdapter(supplierId);
  const orchestratorFirst = isApiPrewarmOrchestratorFirst(supplierId);

  let scoped;
  if (adapter && !orchestratorFirst) {
    logAdapterBypassObservation({
      supplierId,
      entryPoint: "api_product_search",
      query: q,
      strategyUsed: adapter.apiSource,
    });
    scoped = (await adapter.search(q)).filter(
      (r) => r.supplierId === supplierId
    );
  } else {
    const results = await searchSupplierDiscoveryForSupplier(
      supplierId,
      q,
      supplier?.domain,
      { entryPoint: "api_product_search" }
    );
    scoped = results.filter((r) => r.supplierId === supplierId);
  }

  const enriched = enrichSupplierProductSearchResponse(scoped);

  if (adapter && !orchestratorFirst) {
    return NextResponse.json({
      supplierId,
      source: adapter.apiSource,
      results: enriched.results,
      resultSummary: enriched.resultSummary,
    });
  }

  if (scoped.length === 0 && !getDomainPlatformConfig(supplier?.domain)) {
    return NextResponse.json({
      supplierId,
      source: "MANUAL_OR_CAPABILITY_ONLY",
      results: [],
      resultSummary: enriched.resultSummary,
    });
  }

  return NextResponse.json({
    supplierId,
    source: resolveSupplierProductSource(supplierId, supplier?.domain),
    results: enriched.results,
    resultSummary: enriched.resultSummary,
  });
}
