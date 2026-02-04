"use client";

import { useState } from "react";
import { CATEGORY_OPTIONS } from "@/lib/categoryDisplay";
import { DraftRFQ } from "@/lib/agent/draftBuilder";
import { getChannelLabel } from "@/lib/intent-engine";
import type { IntentAssessment } from "@/lib/types";
import Card, { CardContent, CardHeader } from "@/components/ui2/Card";
import Button from "@/components/ui2/Button";
import Badge from "@/components/ui2/Badge";

interface ExecutionPanelProps {
  draft: Partial<DraftRFQ> | null;
  intent?: IntentAssessment;
  onCategoryChange: (category: string) => void;
  onDraftFieldChange: (field: string, value: any) => void | Promise<void>;
  onSaveDraft: () => void;
  onSendToSuppliers: () => void;
  isProcessing?: boolean;
  showReasoning?: boolean; // Show internal reasoning (urgency, price, complexity, strategy, why)
}

export default function ExecutionPanel({
  draft,
  intent,
  onCategoryChange,
  onDraftFieldChange,
  onSaveDraft,
  onSendToSuppliers,
  isProcessing = false,
  showReasoning = false, // Default to false for buyers
}: ExecutionPanelProps) {
  // Check env flag for dev/admin override (NEXT_PUBLIC_ vars are available in client components)
  const envShowReasoning = 
    typeof process !== "undefined" && 
    typeof process.env !== "undefined" &&
    process.env.NEXT_PUBLIC_SHOW_EXECUTION_REASONING === "true";
  const shouldShowReasoning = showReasoning || envShowReasoning;
  const [showReviewModal, setShowReviewModal] = useState(false);

  if (!draft) {
    return (
      <Card>
        <CardHeader>
          <h3 className="text-lg font-semibold text-black dark:text-zinc-50">
            Execution Order
          </h3>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Start a conversation to build your request.
          </p>
        </CardContent>
      </Card>
    );
  }

  // SINGLE SOURCE OF TRUTH: Use validateAgentDraftRFQ for all gating
  const { validateAgentDraftRFQ } = require("@/lib/agent/contracts");
  const validation = validateAgentDraftRFQ(draft);
  const canCreate = validation.ok;
  const missing = validation.missing ?? [];

  const handleAddLineItem = () => {
    const currentItems = draft.lineItems || [];
    void onDraftFieldChange("lineItems", [
      ...currentItems,
      { description: "", unit: "EA", quantity: 1 },
    ]);
  };

  const handleRemoveLineItem = (index: number) => {
    const currentItems = draft.lineItems || [];
    void onDraftFieldChange("lineItems", currentItems.filter((_, i) => i !== index));
  };

  const handleLineItemChange = (index: number, field: string, value: any) => {
    const currentItems = draft.lineItems || [];
    const updated = [...currentItems];
    updated[index] = { ...updated[index], [field]: value };
    void onDraftFieldChange("lineItems", updated);
  };

  return (
    <>
      <Card>
        <CardHeader>
          <h3 className="text-lg font-semibold text-black dark:text-zinc-50">
            Execution Order
          </h3>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Intent Assessment - Only show reasoning if enabled */}
          {intent && shouldShowReasoning && (
            <div className="border-b border-zinc-200 dark:border-zinc-700 pb-4 space-y-3">
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  Classified as
                </label>
                <p className="text-sm text-black dark:text-zinc-50">
                  {draft?.category || "Unspecified"}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <div>
                  <span className="text-xs text-zinc-600 dark:text-zinc-400 mr-1">Urgency:</span>
                  <Badge
                    variant={
                      intent.urgency === "high"
                        ? "error"
                        : intent.urgency === "medium"
                        ? "warning"
                        : "info"
                    }
                  >
                    {intent.urgency}
                  </Badge>
                </div>
                <div>
                  <span className="text-xs text-zinc-600 dark:text-zinc-400 mr-1">Price:</span>
                  <Badge
                    variant={
                      intent.priceSensitivity === "high"
                        ? "error"
                        : intent.priceSensitivity === "medium"
                        ? "warning"
                        : "info"
                    }
                  >
                    {intent.priceSensitivity}
                  </Badge>
                </div>
                <div>
                  <span className="text-xs text-zinc-600 dark:text-zinc-400 mr-1">Complexity:</span>
                  <Badge variant={intent.complexity === "complex" ? "warning" : "info"}>
                    {intent.complexity}
                  </Badge>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  Strategy
                </label>
                <Badge variant="success">
                  {getChannelLabel(intent.recommendedChannel)}
                </Badge>
              </div>

              {intent.rationale && intent.rationale.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                    Why
                  </label>
                  <ul className="text-xs text-zinc-600 dark:text-zinc-400 space-y-1 list-disc list-inside">
                    {intent.rationale.map((reason, idx) => (
                      <li key={idx}>{reason}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Category */}
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
              Category
            </label>
            <select
              value={draft.category || ""}
              onChange={(e) => onCategoryChange(e.target.value)}
              className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-black dark:text-zinc-50 focus:outline-none focus:ring-2 focus:ring-slate-600 dark:focus:ring-slate-400"
            >
              {CATEGORY_OPTIONS.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.label}
                </option>
              ))}
            </select>
          </div>

          {/* Status */}
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
              Status
            </label>
            <Badge variant={canCreate ? "success" : "warning"}>
              {canCreate ? "Ready to create request" : "Needs info"}
            </Badge>
          </div>

          {/* Fulfillment Type */}
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
              Fulfillment
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void onDraftFieldChange("fulfillmentType", "DELIVERY")}
                className={`flex-1 px-3 py-2 rounded-lg border-2 transition-colors ${
                  draft.fulfillmentType === "DELIVERY"
                    ? "border-slate-600 bg-slate-100 dark:bg-slate-800 text-black dark:text-zinc-50"
                    : "border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300"
                }`}
              >
                Delivery
              </button>
              <button
                type="button"
                onClick={() => void onDraftFieldChange("fulfillmentType", "PICKUP")}
                className={`flex-1 px-3 py-2 rounded-lg border-2 transition-colors ${
                  draft.fulfillmentType === "PICKUP"
                    ? "border-slate-600 bg-slate-100 dark:bg-slate-800 text-black dark:text-zinc-50"
                    : "border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300"
                }`}
              >
                Pickup
              </button>
            </div>
          </div>

          {/* Needed By */}
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
              Needed By
            </label>
            <input
              type="date"
              value={draft.requestedDate || ""}
              onChange={(e) => void onDraftFieldChange("requestedDate", e.target.value)}
              className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-black dark:text-zinc-50 focus:outline-none focus:ring-2 focus:ring-slate-600 dark:focus:ring-slate-400"
            />
          </div>

          {/* Location (only if delivery) */}
          {draft.fulfillmentType === "DELIVERY" && (
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Delivery Address
              </label>
              <textarea
                value={draft.location || ""}
                onChange={(e) => void onDraftFieldChange("location", e.target.value)}
                placeholder="Street, City, State ZIP"
                rows={2}
                className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-black dark:text-zinc-50 focus:outline-none focus:ring-2 focus:ring-slate-600 dark:focus:ring-slate-400 resize-none"
              />
            </div>
          )}

          {/* Line Items */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Line Items
              </label>
              <button
                type="button"
                onClick={handleAddLineItem}
                className="text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
              >
                + Add
              </button>
            </div>
            <div className="space-y-2">
              {draft.lineItems && draft.lineItems.length > 0 ? (
                draft.lineItems.map((item, idx) => (
                  <div key={idx} className="flex gap-2 items-start">
                    <input
                      type="number"
                      value={item.quantity || ""}
                      onChange={(e) => handleLineItemChange(idx, "quantity", parseInt(e.target.value, 10) || 0)}
                      placeholder="Qty"
                      min="1"
                      className="w-16 px-2 py-1.5 text-sm border border-zinc-300 dark:border-zinc-700 rounded bg-white dark:bg-zinc-900 text-black dark:text-zinc-50 focus:outline-none focus:ring-2 focus:ring-slate-600 dark:focus:ring-slate-400"
                    />
                    <input
                      type="text"
                      value={item.unit || ""}
                      onChange={(e) => handleLineItemChange(idx, "unit", e.target.value.toUpperCase())}
                      placeholder="Unit"
                      className="w-20 px-2 py-1.5 text-sm border border-zinc-300 dark:border-zinc-700 rounded bg-white dark:bg-zinc-900 text-black dark:text-zinc-50 focus:outline-none focus:ring-2 focus:ring-slate-600 dark:focus:ring-slate-400"
                    />
                    <input
                      type="text"
                      value={item.description || ""}
                      onChange={(e) => handleLineItemChange(idx, "description", e.target.value)}
                      placeholder="Description"
                      className="flex-1 px-2 py-1.5 text-sm border border-zinc-300 dark:border-zinc-700 rounded bg-white dark:bg-zinc-900 text-black dark:text-zinc-50 focus:outline-none focus:ring-2 focus:ring-slate-600 dark:focus:ring-slate-400"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveLineItem(idx)}
                      className="text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300"
                    >
                      ×
                    </button>
                  </div>
                ))
              ) : (
                <p className="text-sm text-zinc-500 dark:text-zinc-500">No line items yet</p>
              )}
            </div>
          </div>

          {/* Job Name / PO # */}
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
              Job Name / PO #
            </label>
            <input
              type="text"
              value={draft.jobNameOrPo || ""}
              onChange={(e) => void onDraftFieldChange("jobNameOrPo", e.target.value)}
              placeholder="e.g., Beirne Ave — PO 10492"
              className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-black dark:text-zinc-50 focus:outline-none focus:ring-2 focus:ring-slate-600 dark:focus:ring-slate-400"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
              Notes
            </label>
            <textarea
              value={draft.notes || ""}
              onChange={(e) => void onDraftFieldChange("notes", e.target.value)}
              placeholder="Additional notes or instructions..."
              rows={3}
              className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-black dark:text-zinc-50 focus:outline-none focus:ring-2 focus:ring-slate-600 dark:focus:ring-slate-400 resize-none"
            />
          </div>

          {/* Actions */}
          <div className="border-t border-zinc-200 dark:border-zinc-700 pt-4 space-y-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowReviewModal(true)}
              disabled={isProcessing}
              className="w-full"
            >
              Review Draft
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={onSaveDraft}
              disabled={isProcessing}
              className="w-full"
            >
              Save Draft
            </Button>

            {canCreate ? (
              <>
                <div className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                  Ready to create request
                </div>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    // Hard-disable: validate again before calling handler
                    const v = validateAgentDraftRFQ(draft);
                    if (!v.ok) return; // absolute gate
                    onSendToSuppliers();
                  }}
                  disabled={isProcessing}
                  className="w-full"
                >
                  {isProcessing ? "Sending..." : "Create Request"}
                </Button>
              </>
            ) : (
              <div className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
                Needs info
                {missing.length > 0 && (
                  <div className="text-xs mt-1 text-zinc-500 dark:text-zinc-500">
                    Missing: {missing.join(", ")}
                  </div>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Review Modal */}
      {showReviewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 dark:bg-black/70">
          <Card className="w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
            <CardHeader>
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-black dark:text-zinc-50">
                  Draft Review
                </h3>
                <button
                  onClick={() => setShowReviewModal(false)}
                  className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50"
                >
                  ×
                </button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* V1 FIX: Job Name / PO as primary identifier */}
              <div>
                <h4 className="text-lg font-semibold text-black dark:text-zinc-50 mb-1">
                  {draft.jobNameOrPo || draft.title || "Untitled Request"}
                </h4>
                {draft.jobNameOrPo && draft.title && draft.title !== draft.jobNameOrPo && (
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">
                    {draft.title}
                  </p>
                )}
              </div>
              <div>
                <span className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Category:</span>{" "}
                <span className="text-black dark:text-zinc-50">{draft.category}</span>
              </div>
              <div>
                <span className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Fulfillment:</span>{" "}
                <span className="text-black dark:text-zinc-50">
                  {draft.fulfillmentType === "PICKUP" ? "Pickup" : "Delivery"}
                </span>
              </div>
              <div>
                <span className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Needed by:</span>{" "}
                <span className="text-black dark:text-zinc-50">
                  {draft.requestedDate ? new Date(draft.requestedDate).toLocaleDateString() : "Not set"}
                </span>
              </div>
              {draft.fulfillmentType === "DELIVERY" && draft.location && (
                <div>
                  <span className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Address:</span>{" "}
                  <span className="text-black dark:text-zinc-50">{draft.location}</span>
                </div>
              )}
              {draft.lineItems && draft.lineItems.length > 0 && (
                <div>
                  <span className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Line items:</span>
                  <ul className="mt-1 ml-4 list-disc space-y-1">
                    {draft.lineItems.map((item, idx) => (
                      <li key={idx} className="text-black dark:text-zinc-50">
                        {item.quantity} {item.unit} - {item.description}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {draft.notes && (
                <div>
                  <span className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Notes:</span>{" "}
                  <span className="text-black dark:text-zinc-50">{draft.notes}</span>
                </div>
              )}
              <div className="flex gap-2 pt-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowReviewModal(false)}
                  className="flex-1"
                >
                  Close
                </Button>
                {canCreate && (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => {
                      // Hard-disable: validate again before calling handler
                      const v = validateAgentDraftRFQ(draft);
                      if (!v.ok) {
                        setShowReviewModal(false);
                        return; // absolute gate
                      }
                      setShowReviewModal(false);
                      onSendToSuppliers();
                    }}
                    disabled={isProcessing}
                    className="flex-1"
                  >
                    {isProcessing ? "Sending..." : "Create Request"}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}

