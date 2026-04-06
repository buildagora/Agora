"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Tabs, { TabsList, TabsTrigger, TabsContent } from "@/components/ui2/Tabs";
import Card, { CardContent } from "@/components/ui2/Card";
import Button from "@/components/ui2/Button";
import { categoryIdToLabel } from "@/lib/categoryIds";

interface MaterialRequest {
  id: string;
  categoryId: string;
  requestText: string;
  sendMode: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  counts: {
    totalRecipients: number;
    repliedCount: number;
    pendingCount: number;
    declinedCount: number;
  };
}

interface BidRequest {
  id: string;
  rfqNumber: string;
  status: string;
  createdAt: string;
  title: string | null;
  jobNameOrPo: string | null;
  lineItems: any[];
}

function formatShortDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getStatusBadge(status: string) {
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

function getRfqStatusBadge(status: string) {
  const colors: Record<string, string> = {
    OPEN: "bg-blue-100 text-blue-800",
    AWARDED: "bg-green-100 text-green-800",
    CLOSED: "bg-gray-100 text-gray-800",
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

function getCategoryLabel(categoryId: string): string {
  return categoryIdToLabel[categoryId as keyof typeof categoryIdToLabel] || categoryId;
}

function truncateText(text: string, maxLength: number = 80): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength).trim() + "...";
}

async function deleteMaterialRequest(id: string): Promise<{ ok: true } | { ok: false; message: string }> {
  const res = await fetch(`/api/buyer/material-requests/${id}`, {
    method: "DELETE",
    credentials: "include",
  });
  const data = (await res.json().catch(() => null)) as {
    ok?: boolean;
    message?: string;
    error?: string;
  } | null;
  if (res.ok && data?.ok) {
    return { ok: true };
  }
  const message =
    (data && typeof data.message === "string" && data.message) ||
    (data && typeof data.error === "string" && data.error) ||
    `Could not delete (${res.status})`;
  return { ok: false, message };
}

export default function AllRequestsClient() {
  const [activeTab, setActiveTab] = useState("materials");
  const [materialRequests, setMaterialRequests] = useState<MaterialRequest[]>([]);
  const [loadingMaterials, setLoadingMaterials] = useState(true);
  const [materialsError, setMaterialsError] = useState<string | null>(null);
  const [deleteRequestId, setDeleteRequestId] = useState<string | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isDeleteSubmitting, setIsDeleteSubmitting] = useState(false);
  const [bidRequests, setBidRequests] = useState<BidRequest[]>([]);
  const [loadingBids, setLoadingBids] = useState(false);
  const [bidsError, setBidsError] = useState<string | null>(null);

  useEffect(() => {
    if (activeTab === "materials") {
      setLoadingMaterials(true);
      setMaterialsError(null);

      fetch("/api/buyer/material-requests", {
        credentials: "include",
        cache: "no-store",
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.ok && Array.isArray(data.data)) {
            setMaterialRequests(data.data);
          } else {
            setMaterialsError("Failed to load material requests");
          }
        })
        .catch((error) => {
          console.error("Error fetching material requests:", error);
          setMaterialsError("Error loading material requests");
        })
        .finally(() => {
          setLoadingMaterials(false);
        });
    }
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === "bids") {
      setLoadingBids(true);
      setBidsError(null);

      fetch("/api/buyer/rfqs", {
        credentials: "include",
        cache: "no-store",
      })
        .then((res) => res.json())
        .then((data) => {
          // Handle both response formats: direct array or { ok: true, data: [...] }
          let rfqs: BidRequest[] = [];
          if (Array.isArray(data)) {
            rfqs = data;
          } else if (data.ok && Array.isArray(data.data)) {
            rfqs = data.data;
          } else {
            setBidsError("Failed to load bid requests");
            return;
          }
          setBidRequests(rfqs);
        })
        .catch((error) => {
          console.error("Error fetching bid requests:", error);
          setBidsError("Error loading bid requests");
        })
        .finally(() => {
          setLoadingBids(false);
        });
    }
  }, [activeTab]);

  function closeDeleteModal() {
    setIsDeleteModalOpen(false);
    setDeleteRequestId(null);
    setIsDeleteSubmitting(false);
  }

  return (
    <div className="flex flex-1 px-6 py-8">
      <div className="w-full max-w-6xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-black mb-2">
            All Requests
          </h1>
          <p className="text-sm text-zinc-600">
            Manage all your material requests and bid requests
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="materials">Materials</TabsTrigger>
            <TabsTrigger value="bids">Bid Requests</TabsTrigger>
          </TabsList>

          <TabsContent value="materials">
            {loadingMaterials ? (
              <Card>
                <CardContent className="p-6">
                  <p className="text-zinc-600 text-center">
                    Loading material requests...
                  </p>
                </CardContent>
              </Card>
            ) : materialsError ? (
              <Card>
                <CardContent className="p-6">
                  <p className="text-red-600 text-center">
                    {materialsError}
                  </p>
                </CardContent>
              </Card>
            ) : materialRequests.length === 0 ? (
              <Card>
                <CardContent className="p-6">
                  <p className="text-zinc-600 text-center">
                    No material requests yet.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {materialRequests.map((request) => (
                  <Card
                    key={request.id}
                    className="hover:bg-gray-50 transition-colors"
                  >
                    <CardContent className="p-6">
                      <div className="flex items-start gap-4 mb-3">
                        <Link
                          href={`/buyer/material-requests/${request.id}`}
                          className="flex-1 min-w-0 block cursor-pointer"
                        >
                          <h3 className="text-base font-semibold text-black mb-1">
                            {truncateText(request.requestText)}
                          </h3>
                          <div className="flex items-center gap-3 text-sm text-zinc-600">
                            <span>{getCategoryLabel(request.categoryId)}</span>
                            <span>•</span>
                            <span>{formatShortDate(request.createdAt)}</span>
                          </div>
                        </Link>
                        <div
                          className="flex shrink-0 flex-col items-end gap-2"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {getStatusBadge(request.status)}
                          <button
                            type="button"
                            className="text-xs text-zinc-600 underline underline-offset-2 hover:text-red-700 disabled:opacity-50"
                            disabled={isDeleteModalOpen}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setDeleteRequestId(request.id);
                              setIsDeleteModalOpen(true);
                            }}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                      <Link
                        href={`/buyer/material-requests/${request.id}`}
                        className="block cursor-pointer"
                      >
                        <div className="text-sm text-zinc-600 mt-3 pt-3 border-t border-zinc-200">
                          Sent to {request.counts.totalRecipients} supplier{request.counts.totalRecipients !== 1 ? "s" : ""}
                          {request.counts.repliedCount > 0 && (
                            <> • {request.counts.repliedCount} response{request.counts.repliedCount !== 1 ? "s" : ""}</>
                          )}
                          {request.counts.pendingCount > 0 && (
                            <> • {request.counts.pendingCount} pending</>
                          )}
                        </div>
                      </Link>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="bids">
            {loadingBids ? (
              <Card>
                <CardContent className="p-6">
                  <p className="text-zinc-600 text-center">
                    Loading bid requests...
                  </p>
                </CardContent>
              </Card>
            ) : bidsError ? (
              <Card>
                <CardContent className="p-6">
                  <p className="text-red-600 text-center">
                    {bidsError}
                  </p>
                </CardContent>
              </Card>
            ) : bidRequests.length === 0 ? (
              <Card>
                <CardContent className="p-6">
                  <p className="text-zinc-600 text-center">
                    No bid requests yet.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {bidRequests.map((rfq) => (
                  <Link
                    key={rfq.id}
                    href={`/buyer/rfqs/${rfq.id}`}
                    className="block"
                  >
                    <Card className="hover:bg-gray-50 transition-colors cursor-pointer">
                      <CardContent className="p-6">
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex-1">
                            <h3 className="text-base font-semibold text-black mb-1">
                              {rfq.jobNameOrPo || rfq.title || "Untitled Request"}
                            </h3>
                            <div className="flex items-center gap-3 text-sm text-zinc-600">
                              <span>{rfq.rfqNumber}</span>
                              <span>•</span>
                              <span>{formatShortDate(rfq.createdAt)}</span>
                            </div>
                          </div>
                          <div className="ml-4">
                            {getRfqStatusBadge(rfq.status)}
                          </div>
                        </div>
                        <div className="text-sm text-zinc-600 mt-3 pt-3 border-t border-zinc-200">
                          {rfq.lineItems.length} item{rfq.lineItems.length !== 1 ? "s" : ""}
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {isDeleteModalOpen && deleteRequestId ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-request-modal-title"
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/50"
            aria-label="Close dialog"
            onClick={(e) => {
              e.stopPropagation();
              if (!isDeleteSubmitting) closeDeleteModal();
            }}
          />
          <Card
            className="relative z-10 w-full max-w-md shadow-lg border border-zinc-200"
            onClick={(e) => e.stopPropagation()}
          >
            <CardContent className="p-6">
              <h2
                id="delete-request-modal-title"
                className="text-lg font-semibold text-black"
              >
                Delete request?
              </h2>
              <p className="mt-2 text-sm text-zinc-600">
                This action cannot be undone.
              </p>
              <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={isDeleteSubmitting}
                  onClick={(e) => {
                    e.stopPropagation();
                    closeDeleteModal();
                  }}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  className="!bg-red-600 hover:!bg-red-700 focus:!ring-red-600"
                  disabled={isDeleteSubmitting}
                  onClick={async (e) => {
                    e.stopPropagation();
                    const id = deleteRequestId;
                    setIsDeleteSubmitting(true);
                    const result = await deleteMaterialRequest(id);
                    setIsDeleteSubmitting(false);
                    if (result.ok) {
                      setMaterialRequests((prev) => prev.filter((r) => r.id !== id));
                      closeDeleteModal();
                    } else {
                      window.alert(result.message);
                    }
                  }}
                >
                  {isDeleteSubmitting ? "Deleting…" : "Delete"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}

