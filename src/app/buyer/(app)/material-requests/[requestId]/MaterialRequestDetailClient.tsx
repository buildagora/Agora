"use client";

import Link from "next/link";
import Card, { CardContent } from "@/components/ui2/Card";
import { categoryIdToLabel } from "@/lib/categoryIds";

interface Request {
  id: string;
  categoryId: string;
  requestText: string;
  sendMode: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  fulfilledAt: string | null;
}

interface Recipient {
  supplierId: string;
  supplierName: string;
  conversationId: string;
  status: string;
  sentAt: string;
  viewedAt: string | null;
  respondedAt: string | null;
  conversationUpdatedAt: string;
  operatorNotes: string | null;
}

interface Recipients {
  replied: Recipient[];
  pending: Recipient[];
  closedOut: Recipient[];
}

interface MaterialRequestDetailClientProps {
  request: Request;
  recipients: Recipients;
  /** Back link target (default buyer requests hub). */
  backHref?: string;
}

function formatShortDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return formatShortDate(dateString);
}

function statusBadge(status: string) {
  const colors: Record<string, string> = {
    OPEN: "bg-blue-100 text-blue-800",
    CLOSED: "bg-zinc-100 text-zinc-800",
    FULFILLED: "bg-green-100 text-green-800",
    CANCELLED: "bg-red-100 text-red-800",
  };
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
        colors[status] || "bg-zinc-100 text-zinc-800"
      }`}
    >
      {status}
    </span>
  );
}

function getRecipientStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    REPLIED: "Available",
    OUT_OF_STOCK: "Out of Stock",
    SENT: "Checking",
    VIEWED: "Checking",
    NO_RESPONSE: "No Response",
    DECLINED: "Declined",
  };
  return labels[status] || status;
}

function recipientStatusBadge(status: string) {
  const colors: Record<string, string> = {
    REPLIED: "bg-emerald-50 text-emerald-800 border border-emerald-200",
    SENT: "bg-amber-50 text-amber-800 border border-amber-200",
    VIEWED: "bg-amber-50 text-amber-800 border border-amber-200",
    OUT_OF_STOCK: "bg-orange-50 text-orange-800 border border-orange-200",
    NO_RESPONSE: "bg-zinc-50 text-zinc-600 border border-zinc-200",
    DECLINED: "bg-red-50 text-red-700 border border-red-200",
  };
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium shrink-0 ${
        colors[status] || "bg-zinc-50 text-zinc-600 border border-zinc-200"
      }`}
    >
      {getRecipientStatusLabel(status)}
    </span>
  );
}

function SupplierRow({ recipient, timeValue }: { recipient: Recipient; timeValue: string }) {
  return (
    <div className="border border-zinc-200 rounded-xl p-4">
      <div className="flex flex-col gap-1.5 min-w-0">
        <div className="flex items-center gap-2.5 flex-wrap">
          <span className="font-semibold text-black truncate">{recipient.supplierName}</span>
          {recipientStatusBadge(recipient.status)}
        </div>
        <p className="text-xs text-zinc-500">
          Checked by Agora • {timeValue}
        </p>
        {recipient.operatorNotes?.trim() ? (
          <p className="text-sm text-zinc-700 mt-3 whitespace-pre-wrap leading-relaxed">
            {recipient.operatorNotes.trim()}
          </p>
        ) : null}
      </div>
    </div>
  );
}

export default function MaterialRequestDetailClient({
  request,
  recipients,
  backHref = "/buyer/requests",
}: MaterialRequestDetailClientProps) {
  const totalRecipients =
    recipients.replied.length + recipients.pending.length + recipients.closedOut.length;

  const allRecipients = [
    ...recipients.replied,
    ...recipients.pending,
    ...recipients.closedOut,
  ];

  const categoryLabel =
    categoryIdToLabel[request.categoryId as keyof typeof categoryIdToLabel] || request.categoryId;

  const metaParts = [
    categoryLabel,
    `${totalRecipients} supplier${totalRecipients !== 1 ? "s" : ""}`,
    `Searched ${formatShortDate(request.createdAt)}`,
  ].filter(Boolean);

  return (
    <div className="flex flex-1 px-6 py-8">
      <div className="w-full max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap mb-3">
              <Link
                href={backHref}
                className="text-sm text-zinc-500 hover:text-zinc-700 transition-colors"
              >
                ← Back
              </Link>
              {statusBadge(request.status)}
            </div>
            <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-[0.12em] mb-2">
              SEARCH RESULTS
            </p>
            <h1 className="text-2xl sm:text-3xl font-normal text-black tracking-tight break-words leading-snug">
              {request.requestText.trim() || "Your search"}
            </h1>
            <p className="text-xs text-zinc-500 mt-2 tracking-wide">
              {metaParts.join(" · ")}
            </p>
          </div>
        </div>

        {/* Mini stats row */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <span className="text-zinc-600">
            <strong className="text-black font-semibold">{totalRecipients}</strong> suppliers checked
          </span>
          <span className="text-zinc-300 select-none" aria-hidden>·</span>
          <span className="text-zinc-600">
            <strong className="text-green-600 font-semibold">{recipients.replied.length}</strong> available
          </span>
          <span className="text-zinc-300 select-none" aria-hidden>·</span>
          <span className="text-zinc-600">
            <strong className="text-amber-600 font-semibold">{recipients.pending.length}</strong> checking
          </span>
          <span className="text-zinc-300 select-none" aria-hidden>·</span>
          <span className="text-zinc-600">
            <strong className="text-zinc-600 font-semibold">{recipients.closedOut.length}</strong> unavailable
          </span>
        </div>

        {allRecipients.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-zinc-700 mb-3">Results</h2>
            <Card>
              <CardContent className="p-5 space-y-3">
                {allRecipients.map((recipient) => (
                  <SupplierRow
                    key={recipient.conversationId}
                    recipient={recipient}
                    timeValue={formatRelativeTime(
                      recipient.respondedAt || recipient.conversationUpdatedAt
                    )}
                  />
                ))}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Empty state */}
        {totalRecipients === 0 && (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-sm text-zinc-500">
                No supplier results yet.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
