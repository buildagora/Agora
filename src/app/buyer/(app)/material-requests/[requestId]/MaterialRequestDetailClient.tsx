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
  lastMessagePreview: string | null;
}

interface Recipients {
  replied: Recipient[];
  pending: Recipient[];
  closedOut: Recipient[];
}

interface MaterialRequestDetailClientProps {
  request: Request;
  recipients: Recipients;
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
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

function formatSendMode(sendMode: string): string {
  if (sendMode === "DIRECT") return "Direct";
  if (sendMode === "NETWORK") return "Network";
  return sendMode;
}

function statusBadge(status: string) {
  const colors: Record<string, string> = {
    OPEN: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
    CLOSED: "bg-zinc-100 text-zinc-800 dark:bg-zinc-700 dark:text-zinc-200",
    FULFILLED: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
    CANCELLED: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  };
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
        colors[status] || "bg-zinc-100 text-zinc-800 dark:bg-zinc-700 dark:text-zinc-200"
      }`}
    >
      {status}
    </span>
  );
}

function getRecipientStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    SENT: "Sent",
    VIEWED: "Viewed",
    REPLIED: "Replied",
    DECLINED: "Declined",
    OUT_OF_STOCK: "Out of Stock",
    NO_RESPONSE: "No Response",
  };
  return labels[status] || status;
}

function recipientStatusBadge(status: string) {
  const colors: Record<string, string> = {
    REPLIED: "bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300 border border-green-200 dark:border-green-800",
    SENT: "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 border border-amber-200 dark:border-amber-800",
    VIEWED: "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 border border-blue-200 dark:border-blue-800",
    DECLINED: "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300 border border-red-200 dark:border-red-800",
    OUT_OF_STOCK: "bg-orange-50 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300 border border-orange-200 dark:border-orange-800",
    NO_RESPONSE: "bg-zinc-50 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-600",
  };
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium shrink-0 ${
        colors[status] || "bg-zinc-50 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-600"
      }`}
    >
      {getRecipientStatusLabel(status)}
    </span>
  );
}

function SupplierRow({
  recipient,
  timeLabel,
  timeValue,
}: {
  recipient: Recipient;
  timeLabel: string;
  timeValue: string;
}) {
  return (
    <Link
      href={`/buyer/suppliers/talk/${recipient.supplierId}?conversationId=${recipient.conversationId}`}
      className="flex items-center gap-4 py-4 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors cursor-pointer group first:pt-0 last:pb-0"
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2.5 flex-wrap">
          <span className="font-semibold text-black dark:text-zinc-50 truncate">
            {recipient.supplierName}
          </span>
          {recipientStatusBadge(recipient.status)}
        </div>
        {recipient.lastMessagePreview && (
          <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-2 line-clamp-2 leading-relaxed">
            {recipient.lastMessagePreview}
          </p>
        )}
        <p className="text-xs text-zinc-500 dark:text-zinc-500 mt-1.5">
          {timeLabel} {timeValue}
        </p>
      </div>
      <span className="text-zinc-300 dark:text-zinc-600 group-hover:text-zinc-500 dark:group-hover:text-zinc-400 shrink-0 self-center" aria-hidden>→</span>
    </Link>
  );
}

export default function MaterialRequestDetailClient({
  request,
  recipients,
}: MaterialRequestDetailClientProps) {
  const totalRecipients =
    recipients.replied.length + recipients.pending.length + recipients.closedOut.length;

  const categoryLabel =
    categoryIdToLabel[request.categoryId as keyof typeof categoryIdToLabel] || request.categoryId;

  const metaParts = [
    categoryLabel,
    formatSendMode(request.sendMode),
    `${totalRecipients} supplier${totalRecipients !== 1 ? "s" : ""}`,
    formatShortDate(request.createdAt),
  ].filter(Boolean);

  return (
    <div className="flex flex-1 px-6 py-8">
      <div className="w-full max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap mb-2">
              <Link
                href="/buyer/requests"
                className="text-sm text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
              >
                ← Back
              </Link>
              {statusBadge(request.status)}
            </div>
            <h1 className="text-xl font-semibold text-black dark:text-zinc-50 tracking-tight break-words">
              {request.requestText.trim() || "Material request"}
            </h1>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1.5 tracking-wide">
              {metaParts.join(" · ")}
            </p>
          </div>
        </div>

        {/* Request summary card – request content only; metadata is in the header */}
        <Card>
          <CardContent className="p-5 sm:p-6">
            <dl>
              <dt className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1.5">Request</dt>
              <dd className="text-sm text-black dark:text-zinc-50 whitespace-pre-wrap break-words leading-relaxed">
                {request.requestText.trim() || "—"}
              </dd>
            </dl>
          </CardContent>
        </Card>

        {/* Mini stats row */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <span className="text-zinc-600 dark:text-zinc-400">
            <strong className="text-black dark:text-zinc-50 font-semibold">{totalRecipients}</strong> total
          </span>
          <span className="text-zinc-300 dark:text-zinc-600 select-none" aria-hidden>·</span>
          <span className="text-zinc-600 dark:text-zinc-400">
            <strong className="text-green-600 dark:text-green-400 font-semibold">{recipients.replied.length}</strong> responded
          </span>
          <span className="text-zinc-300 dark:text-zinc-600 select-none" aria-hidden>·</span>
          <span className="text-zinc-600 dark:text-zinc-400">
            <strong className="text-amber-600 dark:text-amber-400 font-semibold">{recipients.pending.length}</strong> pending
          </span>
          <span className="text-zinc-300 dark:text-zinc-600 select-none" aria-hidden>·</span>
          <span className="text-zinc-600 dark:text-zinc-400">
            <strong className="text-zinc-600 dark:text-zinc-400 font-semibold">{recipients.closedOut.length}</strong> closed out
          </span>
        </div>

        {/* Supplier Responses */}
        {recipients.replied.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-3">
              Supplier responses ({recipients.replied.length})
            </h2>
            <Card>
              <CardContent className="p-5 divide-y divide-zinc-100 dark:divide-zinc-700/50">
                {recipients.replied.map((recipient) => (
                  <SupplierRow
                    key={recipient.conversationId}
                    recipient={recipient}
                    timeLabel="Last activity"
                    timeValue={formatRelativeTime(recipient.respondedAt || recipient.conversationUpdatedAt)}
                  />
                ))}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Pending Response */}
        {recipients.pending.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-3">
              Pending response ({recipients.pending.length})
            </h2>
            <Card>
              <CardContent className="p-5 divide-y divide-zinc-100 dark:divide-zinc-700/50">
                {recipients.pending.map((recipient) => (
                  <SupplierRow
                    key={recipient.conversationId}
                    recipient={recipient}
                    timeLabel="Sent"
                    timeValue={formatRelativeTime(recipient.sentAt)}
                  />
                ))}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Closed Out */}
        {recipients.closedOut.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-3">
              Closed out ({recipients.closedOut.length})
            </h2>
            <Card>
              <CardContent className="p-5 divide-y divide-zinc-100 dark:divide-zinc-700/50">
                {recipients.closedOut.map((recipient) => (
                  <SupplierRow
                    key={recipient.conversationId}
                    recipient={recipient}
                    timeLabel="Last activity"
                    timeValue={formatRelativeTime(
                      recipient.respondedAt || recipient.conversationUpdatedAt || recipient.sentAt
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
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                No suppliers were attached to this request.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
