import { getSupplierFulfillmentMode } from "@/lib/suppliers/fulfillmentModes";

export type ProcurementActionType =
  | "VIEW_SUPPLIER_PRODUCT"
  | "CREATE_ORDER_REQUEST"
  | "REQUEST_QUOTE"
  | "CONTACT_SUPPLIER";

export type ProcurementPrimaryAction = {
  type: ProcurementActionType;
  label: string;
  description: string;
  opensExternal: boolean;
};

const VIEW_SUPPLIER_PRODUCT_ECOMMERCE: ProcurementPrimaryAction = {
  type: "VIEW_SUPPLIER_PRODUCT",
  label: "View supplier product",
  description:
    "Open this product on the supplier’s website to confirm availability and purchase.",
  opensExternal: true,
};

const VIEW_SUPPLIER_PRODUCT_HYBRID: ProcurementPrimaryAction = {
  type: "VIEW_SUPPLIER_PRODUCT",
  label: "View supplier product",
  description:
    "Open this listing on the supplier’s website, or request help if pricing/availability is unclear.",
  opensExternal: true,
};

const CREATE_ORDER_REQUEST: ProcurementPrimaryAction = {
  type: "CREATE_ORDER_REQUEST",
  label: "Create order request",
  description:
    "Send a structured order request to this supplier for confirmation.",
  opensExternal: false,
};

const REQUEST_QUOTE: ProcurementPrimaryAction = {
  type: "REQUEST_QUOTE",
  label: "Request pricing",
  description:
    "Send this request to the supplier for pricing, availability, or a substitute.",
  opensExternal: false,
};

const CONTACT_SUPPLIER: ProcurementPrimaryAction = {
  type: "CONTACT_SUPPLIER",
  label: "Contact supplier",
  description: "Contact this supplier to confirm details.",
  opensExternal: false,
};

/**
 * Resolves the primary buyer action for a supplier listing context.
 * Does not perform navigation or persist requests — routing only.
 */
export function getPrimaryProcurementAction(args: {
  supplierId: string;
  hasProductUrl?: boolean;
  hasAutomatedListing?: boolean;
  isExactMode?: boolean;
}): ProcurementPrimaryAction {
  const { supplierId, hasProductUrl, isExactMode } = args;
  const mode = getSupplierFulfillmentMode(supplierId);

  if (mode === "ECOMMERCE" && hasProductUrl) {
    return VIEW_SUPPLIER_PRODUCT_ECOMMERCE;
  }

  if (mode === "HYBRID" && hasProductUrl && isExactMode) {
    return VIEW_SUPPLIER_PRODUCT_HYBRID;
  }

  if (mode === "REP_ASSISTED") {
    return CREATE_ORDER_REQUEST;
  }

  if (mode === "HYBRID") {
    return REQUEST_QUOTE;
  }

  return CONTACT_SUPPLIER;
}
