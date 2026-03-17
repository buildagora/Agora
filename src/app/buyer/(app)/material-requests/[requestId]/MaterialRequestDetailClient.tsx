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

function recipientStatusBadge(status: string) {
  const colors: Record<string, string> = {
    REPLIED: "bg-green-100 text-green-800",
    SENT: "bg-yellow-100 text-yellow-800",
    VIEWED: "bg-blue-100 text-blue-800",
    DECLINED: "bg-red-100 text-red-800",
    OUT_OF_STOCK: "bg-orange-100 text-orange-800",
    NO_RESPONSE: "bg-gray-100 text-gray-800",
  };
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
        colors[status] || "bg-gray-100 text-gray-800"
      }`}
    >
      {status}
    </span>
  );
}

export default function MaterialRequestDetailClient({
  request,
  recipients,
}: MaterialRequestDetailClientProps) {
  const totalRecipients =
    recipients.replied.length + recipients.pending.length + recipients.closedOut.length;

  return (
    <div className="flex flex-1 px-6 py-8">
      <div className="w-full max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Material Request</h1>
            <p className="text-sm text-gray-500 mt-1">Created {formatDate(request.createdAt)}</p>
          </div>
          <div className="flex items-center gap-3">
            {statusBadge(request.status)}
            <Link href="/buyer/suppliers/talk">
              <button className="text-sm text-gray-600 hover:text-gray-900">← Back</button>
            </Link>
          </div>
        </div>

        {/* Request Summary Card */}
        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold text-gray-900">Request Summary</h2>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-gray-700">Category</label>
                <p className="text-sm text-gray-900 mt-1">
                  {categoryIdToLabel[request.categoryId as keyof typeof categoryIdToLabel] || request.categoryId}
                </p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Send Mode</label>
                <p className="text-sm text-gray-900 mt-1">{request.sendMode}</p>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Request Text</label>
              <p className="text-sm text-gray-900 mt-1 whitespace-pre-wrap">{request.requestText}</p>
            </div>
          </CardContent>
        </Card>

        {/* Summary Stats */}
        <div className="grid grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-gray-900">{totalRecipients}</div>
              <div className="text-sm text-gray-500 mt-1">Total Suppliers</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-green-600">{recipients.replied.length}</div>
              <div className="text-sm text-gray-500 mt-1">Replied</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-yellow-600">{recipients.pending.length}</div>
              <div className="text-sm text-gray-500 mt-1">Pending</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-gray-600">{recipients.closedOut.length}</div>
              <div className="text-sm text-gray-500 mt-1">No Response / Closed</div>
            </CardContent>
          </Card>
        </div>

        {/* Replied Section */}
        {recipients.replied.length > 0 && (
          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold text-green-700">Replied ({recipients.replied.length})</h2>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {recipients.replied.map((recipient) => (
                  <Link
                    key={recipient.conversationId}
                    href={`/buyer/suppliers/talk/${recipient.supplierId}?conversationId=${recipient.conversationId}`}
                    className="block p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-medium text-gray-900">{recipient.supplierName}</h3>
                          {recipientStatusBadge(recipient.status)}
                        </div>
                        {recipient.lastMessagePreview && (
                          <p className="text-sm text-gray-600 mt-1">{recipient.lastMessagePreview}</p>
                        )}
                        <p className="text-xs text-gray-500 mt-1">
                          Replied {formatDate(recipient.respondedAt || recipient.conversationUpdatedAt)}
                        </p>
                      </div>
                      <div className="text-gray-400">→</div>
                    </div>
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Pending Section */}
        {recipients.pending.length > 0 && (
          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold text-yellow-700">Pending ({recipients.pending.length})</h2>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {recipients.pending.map((recipient) => (
                  <Link
                    key={recipient.conversationId}
                    href={`/buyer/suppliers/talk/${recipient.supplierId}?conversationId=${recipient.conversationId}`}
                    className="block p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-medium text-gray-900">{recipient.supplierName}</h3>
                          {recipientStatusBadge(recipient.status)}
                        </div>
                        {recipient.lastMessagePreview && (
                          <p className="text-sm text-gray-600 mt-1">{recipient.lastMessagePreview}</p>
                        )}
                        <p className="text-xs text-gray-500 mt-1">
                          Sent {formatDate(recipient.sentAt)}
                        </p>
                      </div>
                      <div className="text-gray-400">→</div>
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
              <h2 className="text-lg font-semibold text-gray-700">No Response / Closed Out ({recipients.closedOut.length})</h2>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {recipients.closedOut.map((recipient) => (
                  <Link
                    key={recipient.conversationId}
                    href={`/buyer/suppliers/talk/${recipient.supplierId}?conversationId=${recipient.conversationId}`}
                    className="block p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-medium text-gray-900">{recipient.supplierName}</h3>
                          {recipientStatusBadge(recipient.status)}
                        </div>
                        {recipient.lastMessagePreview && (
                          <p className="text-sm text-gray-600 mt-1">{recipient.lastMessagePreview}</p>
                        )}
                        <p className="text-xs text-gray-500 mt-1">
                          Sent {formatDate(recipient.sentAt)}
                        </p>
                      </div>
                      <div className="text-gray-400">→</div>
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
            <CardContent className="py-12 text-center">
              <p className="text-gray-500">No recipients found for this request.</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

