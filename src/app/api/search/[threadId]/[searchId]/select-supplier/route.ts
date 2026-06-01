/**
 * POST /api/search/[threadId]/[searchId]/select-supplier
 *
 * Bridges the chat-driven search to main's rich supplier detail page.
 *
 * The search produces a list of SupplierCards but no MaterialRequest. The
 * detail page (/request/[requestId]/supplier/[supplierId]) requires one.
 * When the buyer clicks a card, this route:
 *   1. Verifies they own the chat thread + the search exists
 *   2. Creates a MaterialRequest (DIRECT mode to the chosen supplier) by
 *      forwarding to the existing /api/buyer/material-requests route — which
 *      already handles anonymous buyers, supplier conversation creation, and the
 *      operator notification email. Forwards search.location coordinates so
 *      detail-page distance matches the search results cards.
 *   3. Returns the new materialRequestId so the client can navigate
 *
 * Body:    { supplierId: string }
 * Returns: { ok: true, materialRequestId } or { ok: false, code, message }
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserFromRequest } from "@/lib/auth/server";
import { readAnonymousId } from "@/lib/chat/anonId.server";
import { loadThread } from "@/lib/chat/threads.server";
import { loadSearch } from "@/lib/search/runSearch.server";
import { getPrisma } from "@/lib/db.server";
import { normalizeToCanonicalCategoryId } from "@/lib/suppliers/categoryTaxonomy";
import {
  resolveSupplierPrimaryCategoryId,
  supplierPrimaryCategorySelect,
} from "@/lib/suppliers/primaryCategory.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ threadId: string; searchId: string }> }
) {
  const { threadId, searchId } = await context.params;

  let body: { supplierId?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { ok: false, code: "INVALID_JSON", message: "Body must be JSON" },
      { status: 400 }
    );
  }
  const supplierId =
    typeof body.supplierId === "string" && body.supplierId.length > 0
      ? body.supplierId
      : null;
  if (!supplierId) {
    return NextResponse.json(
      { ok: false, code: "MISSING_SUPPLIER", message: "supplierId is required" },
      { status: 400 }
    );
  }

  // Ownership: caller must own the thread the search lives in
  const user = await getCurrentUserFromRequest(req);
  const anonymousId = user ? null : readAnonymousId(req);
  if (!user && !anonymousId) {
    return NextResponse.json(
      { ok: false, code: "SEARCH_NOT_FOUND", message: "Search not found" },
      { status: 404 }
    );
  }
  const owner = user ? { userId: user.id } : { anonymousId: anonymousId! };

  const thread = await loadThread(threadId, owner);
  if (!thread) {
    return NextResponse.json(
      { ok: false, code: "SEARCH_NOT_FOUND", message: "Search not found" },
      { status: 404 }
    );
  }

  const search = await loadSearch({ threadId, searchId });
  if (!search) {
    return NextResponse.json(
      { ok: false, code: "SEARCH_NOT_FOUND", message: "Search not found" },
      { status: 404 }
    );
  }

  const prisma = getPrisma();
  const supplier = await prisma.supplier.findUnique({
    where: { id: supplierId },
    select: supplierPrimaryCategorySelect,
  });
  if (!supplier) {
    return NextResponse.json(
      { ok: false, code: "SUPPLIER_NOT_FOUND", message: "Supplier not found" },
      { status: 404 }
    );
  }

  // Forward to the existing material-requests route. Passing cookies so it
  // resolves the anonymous-buyer identity the same way it does for the
  // direct-message flow. We deliberately omit buyerName/buyerPhone/
  // initialMessage so the route falls back to operator-mediated behavior
  // (no first SupplierMessage, just the request + recipient row).
  const proto = req.headers.get("x-forwarded-proto") ?? "http";
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const targetUrl = `${proto}://${host}/api/buyer/material-requests`;

  const forwardHeaders: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const cookieHeader = req.headers.get("cookie");
  if (cookieHeader) forwardHeaders.cookie = cookieHeader;

  const inferredCategoryId = search.category
    ? normalizeToCanonicalCategoryId(search.category)
    : null;
  const materialRequestCategoryId =
    inferredCategoryId ?? resolveSupplierPrimaryCategoryId(supplier);

  let resp: Response;
  try {
    resp = await fetch(targetUrl, {
      method: "POST",
      headers: forwardHeaders,
      body: JSON.stringify({
        categoryId: materialRequestCategoryId,
        requestText: search.query,
        sendMode: "DIRECT",
        supplierIds: [supplierId],
        latitude: search.location.lat,
        longitude: search.location.lng,
        locationLabel: search.location.label,
      }),
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        ok: false,
        code: "FORWARD_FAILED",
        message: err?.message ?? "Could not create material request",
      },
      { status: 502 }
    );
  }

  const data: any = await resp.json().catch(() => ({}));
  if (!resp.ok || !data?.ok) {
    return NextResponse.json(
      {
        ok: false,
        code: data?.error ?? "MATERIAL_REQUEST_FAILED",
        message: data?.message ?? `material-requests returned ${resp.status}`,
      },
      { status: resp.status >= 400 && resp.status < 600 ? resp.status : 500 }
    );
  }

  return NextResponse.json(
    { ok: true, materialRequestId: data.materialRequestId },
    { status: 200 }
  );
}
