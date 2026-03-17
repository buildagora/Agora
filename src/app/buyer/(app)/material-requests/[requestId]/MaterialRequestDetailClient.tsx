"use client";

import Link from "next/link";
import Card, { CardContent, CardHeader } from "@/components/ui2/Card";
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

function formatSendMode(sendMode: string): string {
  if (sendMode === "DIRECT") return "Direct";
  if (sendMode === "NETWORK") return "Network";
  return sendMode;
}

function statusBadge(status: string) {
  const colors: Record<string, string> = {
    OPEN: "bg-blue-100 text-blue-800",
    CLOSED: "bg-gray-100 text-gray-800",
    FULFILLED: "bg-green-100 text-green-800",
    CANCELLED: "bg-red-100 text-red-800",
  };
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
        colors[status] || "bg-gray-100 text-gray-800"
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
    REPLIED: "bg-green-50 text-green-700 border border-green-200",
    SENT: "bg-yellow-50 text-yellow-700 border border-yellow-200",
    VIEWED: "bg-blue-50 text-blue-700 border border-blue-200",
    DECLINED: "bg-red-50 text-red-700 border border-red-200",
    OUT_OF_STOCK: "bg-orange-50 text-orange-700 border border-orange-200",
    NO_RESPONSE: "bg-gray-50 text-gray-700 border border-gray-200",
  };
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
        colors[status] || "bg-gray-50 text-gray-700 border border-gray-200"
      }`}
    >
      {getRecipientStatusLabel(status)}
    </span>
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

  return (
    <div className="flex flex-1 px-6 py-8">
      <div className="w-full max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between pb-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Material Request • {categoryLabel}
            </h1>
            <p className="text-sm text-gray-500 mt-2">
              Created {formatShortDate(request.createdAt)}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {statusBadge(request.status)}
            <Link href="/buyer/suppliers/talk">
              <button className="text-sm text-gray-600 hover:text-gray-900 transition-colors">
                ← Back
              </button>
            </Link>
          </div>
        </div>

        {/* Request Summary Card */}
        <Card>
          <CardContent className="pt-6">
            {/* Metadata Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6 pb-6 border-b border-gray-200">
              <div>
                <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                  Category
                </div>
                <div className="text-sm font-semibold text-gray-900">{categoryLabel}</div>
              </div>
              <div>
                <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                  Send Mode
                </div>
                <div className="text-sm font-semibold text-gray-900">
                  {formatSendMode(request.sendMode)}
                </div>
              </div>
              <div>
                <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                  Suppliers Contacted
                </div>
                <div className="text-sm font-semibold text-gray-900">{totalRecipients}</div>
              </div>
            </div>

            {/* Request Text - Prominent */}
            <div className="flex justify-center py-6">
              <div className="max-w-2xl w-full bg-gray-50 rounded-lg px-6 py-6 border border-gray-200">
                <p className="text-lg font-medium leading-relaxed text-gray-900 text-center whitespace-pre-wrap">
                  {request.requestText}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Summary Stats */}
        <div className="grid grid-cols-4 gap-4">
          <Card>
            <CardContent className="min-h-[120px] flex flex-col items-center justify-center text-center py-6">
              <div className="text-3xl font-bold text-gray-900">{totalRecipients}</div>
              <div className="text-sm font-medium text-gray-700 mt-2">Total Suppliers</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="min-h-[120px] flex flex-col items-center justify-center text-center py-6">
              <div className="text-3xl font-bold text-green-600">{recipients.replied.length}</div>
              <div className="text-sm font-medium text-gray-700 mt-2">Supplier Responses</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="min-h-[120px] flex flex-col items-center justify-center text-center py-6">
              <div className="text-3xl font-bold text-yellow-600">{recipients.pending.length}</div>
              <div className="text-sm font-medium text-gray-700 mt-2">Pending Response</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="min-h-[120px] flex flex-col items-center justify-center text-center py-6">
              <div className="text-3xl font-bold text-gray-600">{recipients.closedOut.length}</div>
              <div className="text-sm font-medium text-gray-700 mt-2">Closed Out</div>
            </CardContent>
          </Card>
        </div>

        {/* Supplier Responses Section */}
        {recipients.replied.length > 0 && (
          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold text-gray-900">
                Supplier Responses ({recipients.replied.length})
              </h2>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {recipients.replied.map((recipient) => (
                  <Link
                    key={recipient.conversationId}
                    href={`/buyer/suppliers/talk/${recipient.supplierId}?conversationId=${recipient.conversationId}`}
                    className="block p-4 border border-gray-200 rounded-lg hover:border-gray-300 hover:bg-gray-50 transition-all"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2.5 mb-1.5">
                          <h3 className="font-semibold text-gray-900 truncate">
                            {recipient.supplierName}
                          </h3>
                          {recipientStatusBadge(recipient.status)}
                        </div>
                        <p className="text-xs text-gray-500 mb-1.5">
                          Last activity {formatDate(recipient.respondedAt || recipient.conversationUpdatedAt)}
                        </p>
                        {recipient.lastMessagePreview && (
                          <p className="text-sm text-gray-600 mt-2 line-clamp-2">
                            {recipient.lastMessagePreview}
                          </p>
                        )}
                      </div>
                      <div className="text-gray-300 ml-4 flex-shrink-0">→</div>
                    </div>
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Pending Response Section */}
        {recipients.pending.length > 0 && (
          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold text-gray-900">
                Pending Response ({recipients.pending.length})
              </h2>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {recipients.pending.map((recipient) => (
                  <Link
                    key={recipient.conversationId}
                    href={`/buyer/suppliers/talk/${recipient.supplierId}?conversationId=${recipient.conversationId}`}
                    className="block p-4 border border-gray-200 rounded-lg hover:border-gray-300 hover:bg-gray-50 transition-all"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2.5 mb-1.5">
                          <h3 className="font-semibold text-gray-900 truncate">
                            {recipient.supplierName}
                          </h3>
                          {recipientStatusBadge(recipient.status)}
                        </div>
                        <p className="text-xs text-gray-500">
                          Sent {formatDate(recipient.sentAt)}
                        </p>
                        {recipient.lastMessagePreview && (
                          <p className="text-sm text-gray-600 mt-2 line-clamp-2">
                            {recipient.lastMessagePreview}
                          </p>
                        )}
                      </div>
                      <div className="text-gray-300 ml-4 flex-shrink-0">→</div>
                    </div>
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Closed Out Section */}
        {recipients.closedOut.length > 0 && (
          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold text-gray-900">
                Closed Out ({recipients.closedOut.length})
              </h2>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {recipients.closedOut.map((recipient) => (
                  <Link
                    key={recipient.conversationId}
                    href={`/buyer/suppliers/talk/${recipient.supplierId}?conversationId=${recipient.conversationId}`}
                    className="block p-4 border border-gray-200 rounded-lg hover:border-gray-300 hover:bg-gray-50 transition-all"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2.5 mb-1.5">
                          <h3 className="font-semibold text-gray-900 truncate">
                            {recipient.supplierName}
                          </h3>
                          {recipientStatusBadge(recipient.status)}
                        </div>
                        <p className="text-xs text-gray-500">
                          Last activity{" "}
                          {formatDate(
                            recipient.respondedAt ||
                              recipient.conversationUpdatedAt ||
                              recipient.sentAt
                          )}
                        </p>
                        {recipient.lastMessagePreview && (
                          <p className="text-sm text-gray-600 mt-2 line-clamp-2">
                            {recipient.lastMessagePreview}
                          </p>
                        )}
                      </div>
                      <div className="text-gray-300 ml-4 flex-shrink-0">→</div>
                    </div>
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Empty State */}
        {totalRecipients === 0 && (
          <Card>
            <CardContent className="py-16 text-center">
              <p className="text-gray-500 text-base">
                No suppliers were attached to this request.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
