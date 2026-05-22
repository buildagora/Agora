"use client";

import PurchaseOrderDraftForm from "../PurchaseOrderDraftForm";

type ReviewOrderRequestFormProps = {
  purchaseOrderId: string;
  productName: string;
  originalSearchText: string;
  sourceListingUrl: string | null;
  initialQuantity: string;
  initialUnit: string;
  initialSpecNotes: string;
  initialRequestedDate: string;
  initialDeliveryNotes: string;
};

export default function ReviewOrderRequestForm(props: ReviewOrderRequestFormProps) {
  return <PurchaseOrderDraftForm variant="page" idPrefix="po-review" {...props} />;
}
