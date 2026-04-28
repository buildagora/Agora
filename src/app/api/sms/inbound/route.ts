/**
 * POST /api/sms/inbound
 *
 * Twilio messaging webhook (`application/x-www-form-urlencoded`). Validates
 * the X-Twilio-Signature, normalizes the buyer's phone, looks up the most
 * recently-active conversation for that number, and appends the inbound
 * text as a SupplierMessage. Notifies the supplier via the existing helper.
 *
 * Always returns 200 with empty TwiML — even on "unknown sender" — so Twilio
 * doesn't retry. Spoofed traffic gets 403 (signature check failed) so it
 * can't waste DB cycles.
 */

import { NextRequest } from "next/server";
import { getPrisma } from "@/lib/db.server";
import { normalizeUsPhone } from "@/lib/sms/format";
import { findActiveConversationForBuyerPhone } from "@/lib/sms/routeInbound.server";
import { sendBuyerMessageToSupplier } from "@/lib/supplierMessaging/sendBuyerMessageToSupplier";
import { validateInboundSignature } from "@/lib/sms/twilio.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMPTY_TWIML = '<?xml version="1.0" encoding="UTF-8"?>\n<Response/>';

function twiml(status: number = 200): Response {
  return new Response(EMPTY_TWIML, {
    status,
    headers: { "Content-Type": "text/xml; charset=utf-8" },
  });
}

function plain(status: number, body: string): Response {
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const params: Record<string, string> = {};
  for (const [k, v] of formData.entries()) {
    if (typeof v === "string") params[k] = v;
  }

  // Twilio computes the signature over the FULL public URL of this endpoint.
  // In production behind a proxy, prefer `x-forwarded-proto` / `host`.
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const fullUrl = `${proto}://${host}${req.nextUrl.pathname}`;

  const signatureOk = await validateInboundSignature({
    signatureHeader:
      req.headers.get("x-twilio-signature") ??
      req.headers.get("X-Twilio-Signature"),
    fullUrl,
    params,
  });
  if (!signatureOk) {
    return plain(403, "Invalid signature");
  }

  const fromRaw = params.From || "";
  const body = (params.Body || "").trim();
  if (!fromRaw || !body) {
    console.warn("[inbound_sms_dropped] reason=empty");
    return twiml();
  }

  const normalized = normalizeUsPhone(fromRaw);
  if (!normalized) {
    console.warn(`[inbound_sms_dropped] reason=non_us_phone from=${fromRaw}`);
    return twiml();
  }

  const route = await findActiveConversationForBuyerPhone(normalized.e164);
  if (!route) {
    console.log(`[inbound_sms_no_match] phone=${normalized.e164}`);
    return twiml();
  }

  console.log(
    `[inbound_sms_routed] phone=${normalized.e164} → conv=${route.conversationId} supplier=${route.supplierId} candidates=${route.candidateCount}${route.candidateCount > 1 ? " route=ambiguous" : ""}`
  );

  try {
    await sendBuyerMessageToSupplier({
      prisma: getPrisma(),
      buyer: {
        id: route.buyerId,
        fullName: route.buyerName,
        companyName: null,
      },
      supplierId: route.supplierId,
      conversationId: route.conversationId,
      messageBody: body,
    });
  } catch (err: any) {
    console.error("[inbound_sms_dispatch_failed]", {
      conversationId: route.conversationId,
      error: err?.message ?? String(err),
    });
    // Still 200 — Twilio shouldn't retry; we already accepted the inbound.
  }

  return twiml();
}
