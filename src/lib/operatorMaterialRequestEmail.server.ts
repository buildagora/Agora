import "server-only";
import { categoryIdToLabel } from "@/lib/categoryIds";

export const OPERATOR_MATERIAL_REQUEST_EMAIL = "buildagora@gmail.com";
export const OPERATOR_MATERIAL_REQUEST_SUBJECT = "New Material Request (Agora)";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildOperatorMaterialRequestEmailPayload(opts: {
  materialRequestId: string;
  categoryId: string;
  requestText: string;
  buyerDisplayName: string;
  submittedAtIso: string;
}): { to: string; subject: string; html: string; text: string } {
  const categoryLabel =
    categoryIdToLabel[opts.categoryId as keyof typeof categoryIdToLabel] ||
    opts.categoryId;

  const html = `
          <h2 style="margin:0 0 12px;font-size:18px;">${escapeHtml(OPERATOR_MATERIAL_REQUEST_SUBJECT)}</h2>
          <p style="margin:8px 0;"><strong>Buyer:</strong> ${escapeHtml(opts.buyerDisplayName)}</p>
          <p style="margin:8px 0;"><strong>Category:</strong> ${escapeHtml(categoryLabel)}</p>
          <p style="margin:8px 0;"><strong>Request:</strong></p>
          <pre style="white-space:pre-wrap;font-family:inherit;margin:8px 0;padding:12px;background:#f4f4f5;border-radius:8px;">${escapeHtml(opts.requestText.trim())}</pre>
          <p style="margin:8px 0;"><strong>Timestamp:</strong> ${escapeHtml(opts.submittedAtIso)}</p>
          <p style="margin:8px 0;font-size:12px;color:#71717a;">Request ID: ${escapeHtml(opts.materialRequestId)}</p>
        `;

  const text = [
    OPERATOR_MATERIAL_REQUEST_SUBJECT,
    "",
    `Buyer: ${opts.buyerDisplayName}`,
    `Category: ${categoryLabel}`,
    "",
    "Request:",
    opts.requestText.trim(),
    "",
    `Timestamp: ${opts.submittedAtIso}`,
    `Request ID: ${opts.materialRequestId}`,
  ].join("\n");

  return {
    to: OPERATOR_MATERIAL_REQUEST_EMAIL,
    subject: OPERATOR_MATERIAL_REQUEST_SUBJECT,
    html,
    text,
  };
}
