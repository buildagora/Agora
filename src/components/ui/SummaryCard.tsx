"use client";

import Card, { CardContent, CardHeader } from "@/components/ui2/Card";
import Button from "@/components/ui2/Button";

interface SummaryCardProps {
  lineItemCount: number;
  fulfillmentType?: string;
  requestedDate?: string;
  isFormValid: boolean;
  onReviewClick: () => void;
  onSaveDraft?: () => void;
  isEditingDraft?: boolean;
  className?: string;
}

export default function SummaryCard({
  lineItemCount,
  fulfillmentType,
  requestedDate,
  isFormValid,
  onReviewClick,
  onSaveDraft,
  isEditingDraft = false,
  className = "",
}: SummaryCardProps) {
  return (
    <div className={`sticky top-6 ${className}`}>
      <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg bg-white dark:bg-zinc-900">
        <div className="p-6">
          <h3 className="text-lg font-semibold text-black dark:text-zinc-50 mb-6">
            Summary
          </h3>
          <div className="space-y-4">
            <div className="flex justify-between text-sm">
              <span className="text-zinc-600 dark:text-zinc-400">Line Items</span>
              <span className="font-medium text-black dark:text-zinc-50">
                {lineItemCount}
              </span>
            </div>
            
            {fulfillmentType && (
              <div className="flex justify-between text-sm">
                <span className="text-zinc-600 dark:text-zinc-400">Fulfillment</span>
                <span className="font-medium text-black dark:text-zinc-50">
                  {fulfillmentType}
                </span>
              </div>
            )}
            
            {requestedDate && (
              <div className="flex justify-between text-sm">
                <span className="text-zinc-600 dark:text-zinc-400">
                  {fulfillmentType === "PICKUP" ? "Pickup Date" : "Delivery Date"}
                </span>
                <span className="font-medium text-black dark:text-zinc-50">
                  {new Date(requestedDate).toLocaleDateString()}
                </span>
              </div>
            )}
          </div>
          
          <div className="pt-6 mt-6 space-y-3">
            <Button
              variant="primary"
              size="lg"
              className="w-full"
              onClick={onReviewClick}
              disabled={!isFormValid}
            >
              Review & Submit
            </Button>
            
            {onSaveDraft && (
              <Button
                variant="outline"
                size="md"
                className="w-full"
                onClick={onSaveDraft}
              >
                {isEditingDraft ? "Update Draft" : "Save Draft"}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

