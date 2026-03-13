"use client";

// NOTE: This is a client component, so it doesn't block server-side rendering.
// All data loading happens in useEffect (client-side only).
// If you add any server-side fetch calls in the future, use fetchWithTimeout from @/lib/timeout

import Link from "next/link";
import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth/AuthProvider";
import { enforceRoleClient } from "@/lib/auth/requireRoleClient";
import { BUYER_CATEGORY_OPTIONS } from "@/lib/categoryDisplay";
import { categoryIdToLabel, type CategoryId } from "@/lib/categoryIds";
// RFQ creation via direct API call - no wrapper
import { 
  getRequest, 
  createDraftRequest, 
  validateRequestDraft,
  type RFQRequest,
  type RequestItem,
  type DeliveryTerms 
} from "@/lib/request";
import { useToast, ToastContainer } from "@/components/Toast";
import Card, { CardContent, CardHeader } from "@/components/ui2/Card";
import Button from "@/components/ui2/Button";
import Stepper from "@/components/ui/Stepper";
import SummaryCard from "@/components/ui/SummaryCard";
import { fetchJson } from "@/lib/clientFetch";

interface LineItem {
  description: string;
  unit: string;
  quantity: number;
}

type FulfillmentType = "PICKUP" | "DELIVERY";

const UNIT_OPTIONS = [
  { code: "SQ", label: "Square" },
  { code: "BDL", label: "Bundle" },
  { code: "PC", label: "Piece" },
  { code: "EA", label: "Each" },
  { code: "ROLL", label: "Roll" },
  { code: "BOX", label: "Box" },
  { code: "CTN", label: "Carton" },
  { code: "BAG", label: "Bag" },
] as const;

// Inner component that uses useSearchParams (must be wrapped in Suspense)
// This was previously the default export, but is now wrapped in Suspense
function CreateRFQPageInner() {
  console.log("[SERVER/CLIENT] CreateRFQPageInner: component render start");
  
  console.log("[rfqs/new] before useRouter");
  const router = useRouter();
  console.log("[rfqs/new] after useRouter");
  
  console.log("[rfqs/new] before useSearchParams");
  // useSearchParams can suspend during SSR - must be wrapped in Suspense
  const searchParams = useSearchParams();
  console.log("[rfqs/new] after useSearchParams");
  
  // NEW FOUNDATION: Get user from AuthProvider
  const { user } = useAuth();
  
  // Draft state
  const [draftId, setDraftId] = useState<string | null>(null);
  const [isEditingDraft, setIsEditingDraft] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  
  // Clarification modal state
  const [showClarificationModal, setShowClarificationModal] = useState(false);
  const [missingFields, setMissingFields] = useState<string[]>([]);
  const { showToast, toasts, removeToast } = useToast();
  
  // UI state
  const [currentStep, setCurrentStep] = useState(1);
  const [showReviewModal, setShowReviewModal] = useState(false);
  
  // Form state (using Request model fields)
  const [jobName, setJobName] = useState("");
  const [notes, setNotes] = useState("");
  const [substitutionsAllowed, setSubstitutionsAllowed] = useState(false);
  const [lineItems, setLineItems] = useState<Array<Omit<RequestItem, "id">>>([
    { description: "", unit: "EA", quantity: 0, category: "unknown" },
  ]);
  
  // Legacy fields (for backward compatibility with existing RFQ flow)
  const [categoryId, setCategoryId] = useState<CategoryId | "">("");
  const [fulfillmentType, setFulfillmentType] = useState<FulfillmentType>("DELIVERY");
  const [requestedDate, setRequestedDate] = useState("");
  const [deliveryPreference, setDeliveryPreference] = useState<"MORNING" | "ANYTIME">("ANYTIME");
  const [deliveryInstructions, setDeliveryInstructions] = useState("");
  const [location, setLocation] = useState("");

  // Send To section state
  const [sendMode, setSendMode] = useState<"broadcast" | "preferred">("broadcast");
  const [preferredOptions, setPreferredOptions] = useState<Array<{ id: string; companyName?: string | null; fullName?: string | null; email?: string | null }>>([]);
  const [selectedPreferredSupplierIds, setSelectedPreferredSupplierIds] = useState<string[]>([]);
  const [isLoadingPreferredSuppliers, setIsLoadingPreferredSuppliers] = useState(false);

  // Validation state
  const [touched, setTouched] = useState<{
    title: boolean;
    category: boolean;
    lineItems: boolean[];
    requestedDate: boolean;
    location: boolean;
  }>({
    title: false,
    category: false,
    lineItems: [false],
    requestedDate: false,
    location: false,
  });
  
  // Sync fulfillmentType with deliveryMode (they represent the same thing)
  // Note: deliveryMode state was removed as it was unused
  // fulfillmentType is now managed directly via setFulfillmentType

  // Note: deliveryMode state was removed as it was unused
  // Location/address reset logic can be added back if needed when deliveryMode is reintroduced
  
  // Pre-fill category from query params (e.g., when coming from FIND flow)
  useEffect(() => {
    const categoryParam = searchParams.get("category");
    if (categoryParam) {
      // Try to resolve as categoryId first, then as label
      const normalized = categoryParam.toLowerCase().trim();
      // Check if it's already a categoryId
      if (BUYER_CATEGORY_OPTIONS.some(opt => opt.id === normalized)) {
        setCategoryId(normalized as CategoryId);
      } else {
        // Try to find by label
        const option = BUYER_CATEGORY_OPTIONS.find(opt => opt.label.toLowerCase() === normalized);
        if (option) {
          setCategoryId(option.id);
        }
      }
    }
  }, [searchParams]);

  // Load preferred suppliers when categoryId changes
  useEffect(() => {
    if (!categoryId || !user || user.role !== "BUYER") {
      setPreferredOptions([]);
      setSelectedPreferredSupplierIds([]);
      return;
    }

    const loadPreferredSuppliers = async () => {
      setIsLoadingPreferredSuppliers(true);
      try {
        const result = await fetchJson("/api/buyer/preferred-suppliers", {
          method: "GET",
          credentials: "include",
        });

        if (result.ok && result.json?.ok) {
          const data = result.json.data;
          
          // Handle new shape: { rules, sellersById }
          let rules: any[] = [];
          let sellersById: Record<string, { id: string; companyName?: string | null; fullName?: string | null; email?: string | null }> = {};
          
          if (data && typeof data === "object" && "rules" in data && "sellersById" in data) {
            rules = data.rules || [];
            sellersById = data.sellersById || {};
          }
          // Handle legacy shape: array of rules
          else if (Array.isArray(data)) {
            rules = data;
            sellersById = {};
          }

          // Find rule matching categoryId and enabled=true
          const matchingRule = rules.find((r: any) => 
            (r.categoryId === categoryId || r.category === categoryId) && r.enabled === true
          );

          if (matchingRule && matchingRule.sellerIds && matchingRule.sellerIds.length > 0) {
            // Build preferredOptions from sellerIds using sellersById
            const options = matchingRule.sellerIds.map((sellerId: string) => {
              const seller = sellersById[sellerId];
              return {
                id: sellerId,
                companyName: seller?.companyName || null,
                fullName: seller?.fullName || null,
                email: seller?.email || null,
              };
            });
            setPreferredOptions(options);
            // Pre-select all preferred suppliers
            setSelectedPreferredSupplierIds(matchingRule.sellerIds);
            // Auto-select "preferred" mode if preferred suppliers exist
            if (sendMode === "broadcast") {
              setSendMode("preferred");
            }
          } else {
            setPreferredOptions([]);
            setSelectedPreferredSupplierIds([]);
            // Auto-select "broadcast" mode if no preferred suppliers
            if (sendMode === "preferred") {
              setSendMode("broadcast");
            }
          }
        } else {
          setPreferredOptions([]);
          setSelectedPreferredSupplierIds([]);
        }
      } catch (error) {
        console.error("Failed to load preferred suppliers:", error);
        setPreferredOptions([]);
        setSelectedPreferredSupplierIds([]);
      } finally {
        setIsLoadingPreferredSuppliers(false);
      }
    };

    loadPreferredSuppliers();
  }, [categoryId, user]);

  // Load draft if draftId is in URL params
  useEffect(() => {
    const draftIdParam = searchParams.get("draftId");
    if (draftIdParam) {
      // Note: Draft loading from localStorage is deprecated
      // New foundation: drafts should be stored in database
      // For now, skip draft loading to avoid localStorage dependency
      // TODO: Load draft from database API when Draft model is added to Prisma
      // When implemented, load draft here and populate form fields
    }
  }, [searchParams]);
  
  const [submitted, setSubmitted] = useState(false);

  // Validation functions
  const validateCategory = () => categoryId.length > 0;
  const validateLineItem = (item: LineItem) => {
    return (
      item.description.trim().length > 0 &&
      item.unit.trim().length > 0 &&
      item.quantity > 0
    );
  };
  const validateLineItems = () => {
    return lineItems.length > 0 && lineItems.every(validateLineItem);
  };
  const validateRequestedDate = () => requestedDate.trim().length > 0;
  
  // Normalize address: trim, collapse spaces, uppercase state
  const normalizeAddress = (addr: string): string => {
    // Trim whitespace
    let normalized = addr.trim();
    // Collapse multiple spaces to single space
    normalized = normalized.replace(/\s+/g, " ");
    // Uppercase 2-letter state codes (standalone tokens)
    const statePattern = /\b([a-z]{2})\b/gi;
    normalized = normalized.replace(statePattern, (match) => match.toUpperCase());
    return normalized;
  };

  // US state codes
  const US_STATES = [
    "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
    "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
    "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
    "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
    "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY", "DC"
  ];

  const validateLocation = (): { valid: boolean; error?: string } => {
    // Location only required for DELIVERY
    if (fulfillmentType === "PICKUP") return { valid: true };
    
    const address = location.trim();
    if (address.length === 0) {
      return { valid: false, error: "Location is required for delivery" };
    }

    // Normalize address
    const normalized = normalizeAddress(address);

    // Check 1: Must contain a 5-digit ZIP (or ZIP+4) anywhere
    const zipPattern = /\b\d{5}(-\d{4})?\b/;
    const hasZip = zipPattern.test(normalized);
    if (!hasZip) {
      return { valid: false, error: "Must include a 5-digit ZIP code (e.g., 35801 or 35801-1234)" };
    }

    // Check 2: Must contain a 2-letter US state code as a standalone token (case-insensitive)
    const statePattern = new RegExp(`\\b(${US_STATES.join("|")})\\b`, "i");
    const hasState = statePattern.test(normalized);
    if (!hasState) {
      return { valid: false, error: "Must include a valid 2-letter US state code (e.g., AL, CA, NY)" };
    }

    // Check 3: Must start with a street number
    const streetNumberPattern = /^\s*\d+/;
    const hasStreetNumber = streetNumberPattern.test(normalized);
    if (!hasStreetNumber) {
      return { valid: false, error: "Must start with a street number (e.g., 204, 1234)" };
    }

    return { valid: true };
  };

  const isFormValid = () => {
    const locationValidation = validateLocation();
    const preferredSuppliersValid = sendMode === "broadcast" || (sendMode === "preferred" && selectedPreferredSupplierIds.length > 0);
    return (
      validateCategory() &&
      validateLineItems() &&
      validateRequestedDate() &&
      locationValidation.valid &&
      preferredSuppliersValid
    );
  };

  const shouldShowError = (field: keyof typeof touched, index?: number) => {
    if (submitted) return true;
    if (field === "lineItems" && index !== undefined) {
      return touched.lineItems[index] || false;
    }
    return touched[field] || false;
  };

  // Helper to check if category field should show error styling
  // Only show error when: field is empty AND (form was submitted OR field was touched)
  const shouldShowCategoryError = () => {
    const hasValue = Boolean(categoryId && categoryId.length > 0);
    // If category has a value, never show error
    if (hasValue) return false;
    // Only show error if field is empty AND (submitted OR touched)
    return submitted || touched.category;
  };

  const getLineItemError = (index: number) => {
    if (!shouldShowError("lineItems", index)) return null;
    const item = lineItems[index];
    if (!item.description.trim()) return "Description is required";
    if (!item.unit.trim()) return "Unit is required";
    if (item.quantity <= 0) return "Quantity must be greater than 0";
    return null;
  };

  const getLineItemsError = () => {
    if (!submitted && !touched.lineItems.some((t) => t)) return null;
    if (lineItems.length === 0) return "At least one line item is required";
    return null;
  };

  const getRequestedDateError = () => {
    if (!shouldShowError("requestedDate")) return null;
    if (!validateRequestedDate()) {
      return fulfillmentType === "PICKUP"
        ? "Pickup date is required"
        : "Requested delivery date is required";
    }
    return null;
  };

  const getLocationError = () => {
    if (!shouldShowError("location")) return null;
    if (fulfillmentType === "PICKUP") return null;
    const validation = validateLocation();
    if (!validation.valid) {
      return validation.error || "Please enter a complete address";
    }
    return null;
  };

  const addLineItem = () => {
    setLineItems([...lineItems, { description: "", unit: "EA", quantity: 0, category: "unknown" }]);
    setTouched((prev) => ({
      ...prev,
      lineItems: [...prev.lineItems, false],
    }));
  };

  const updateLineItem = (
    index: number,
    field: keyof Omit<RequestItem, "id">,
    value: string | number | boolean | undefined
  ) => {
    const updated = [...lineItems];
    updated[index] = { ...updated[index], [field]: value };
    setLineItems(updated);
  };

  const removeLineItem = (index: number) => {
    if (lineItems.length > 1) {
      setLineItems(lineItems.filter((_, i) => i !== index));
      setTouched((prev) => ({
        ...prev,
        lineItems: prev.lineItems.filter((_, i) => i !== index),
      }));
    }
  };

  // generateRFQNumber removed - RFQ numbers are now generated by the API

  // Save draft
  const handleSaveDraft = () => {
    if (!user || user.role !== "BUYER") {
      showToast({ type: "error", message: "You must be logged in as a buyer to save a draft." });
      return;
    }

    // Validate minimum requirements for draft
    const hasValidItem = lineItems.some(
      (item) =>
        item.description.trim().length > 0 &&
        item.quantity > 0 &&
        item.unit.trim().length > 0
    );
    
    if (!hasValidItem) {
      showToast({ type: "error", message: "Please fill in at least one item with description, quantity, and unit." });
      return;
    }

    if (fulfillmentType === "DELIVERY" && !location.trim()) {
      showToast({ type: "error", message: "Please enter a delivery address." });
      return;
    }

    if (fulfillmentType === "PICKUP" && !location.trim()) {
      showToast({ type: "error", message: "Please enter a pickup window/location." });
      return;
    }

    if (!requestedDate.trim()) {
      showToast({ type: "error", message: "Please enter a need-by date/time." });
      return;
    }

    try {
      const deliveryTerms: DeliveryTerms = {
        mode: fulfillmentType === "DELIVERY" ? "delivery" : "pickup",
        needBy: requestedDate,
        ...(fulfillmentType === "DELIVERY" && { address: location.trim() }),
        ...(fulfillmentType === "PICKUP" && { pickupWindow: location.trim() }),
      };

      // Create or update draft in-memory (no localStorage persistence)
      // Draft is persisted only when user submits via API
      const draft = createDraftRequest({
        buyerId: user!.id,
        jobName: jobName.trim() || undefined,
        notes: notes.trim() || undefined,
        substitutionsAllowed,
        delivery: deliveryTerms,
        items: lineItems.map((item) => ({
          description: item.description.trim(),
          category: item.category || "unknown",
          quantity: item.quantity,
          unit: item.unit.trim(),
          sku: item.sku?.trim(),
          brand: item.brand?.trim(),
          specs: item.specs,
          allowAlternates: item.allowAlternates,
        })),
      });
      
      setDraftId(draft.id);
      setIsEditingDraft(true);
      showToast({ type: "success", message: "Draft saved successfully!" });
    } catch (error) {
      console.error("Error saving draft:", error);
      showToast({ type: "error", message: error instanceof Error ? error.message : "Failed to save draft." });
    }
  };

  const handleSubmit = async (e: React.FormEvent, _skipValidation = false) => {
    e.preventDefault();
    setSubmitted(true);

    if (!isFormValid()) {
      return;
    }

    // CRITICAL: Do not route to /auth/sign-in here; preserve deep link via role-specific login + returnTo (AuthGuard invariant).
    const allowed = enforceRoleClient({
      userRole: user?.role || null,
      requiredRole: "BUYER",
      routerReplace: router.replace,
    });

    if (!allowed) {
      showToast({ type: "error", message: "You must be logged in as a buyer to create an RFQ." });
      return;
    }

    // If editing a draft, validate it before posting
    if (isEditingDraft && draftId) {
      const draft = await getRequest(draftId, user!.id);
      if (draft) {
        const validation = validateRequestDraft(draft);
        // Only show modal if there are actually missing fields
        if (validation.missingFields.length > 0) {
          // Show clarification modal instead of blocking
          setMissingFields(validation.missingFields);
          setShowClarificationModal(true);
          setValidationErrors([]);
          return;
        }
        // If no missing fields, continue with posting (don't show modal)
        setValidationErrors([]);
        setShowClarificationModal(false);
      }
    } else {
      // For new requests, validate the current form data as a draft would be
      // Build a temporary request object for validation
      try {
        // CRITICAL FIX: Use the actual form field values (requestedDate and location)
        // The form inputs are bound to requestedDate and location, not needBy and address
        // needBy and address are only used when editing drafts (loaded from Request model)
        // Also map fulfillmentType to deliveryMode (form uses fulfillmentType, Request uses deliveryMode)
        const actualDeliveryMode = fulfillmentType === "DELIVERY" ? "delivery" : "pickup";
        const tempDeliveryTerms: DeliveryTerms = {
          mode: actualDeliveryMode,
          needBy: requestedDate, // Use requestedDate (form input)
          ...(actualDeliveryMode === "delivery" && { address: location }), // Use location (form input)
          // Note: For pickup mode, only needBy (pickup date) is required - pickupWindow is optional
          ...(actualDeliveryMode === "pickup" && location && { pickupWindow: location }),
        };
        
        const tempRequest: RFQRequest = {
          id: "temp",
          buyerId: user!.id,
          status: "draft",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          jobName: jobName || undefined,
          notes: notes || undefined,
          substitutionsAllowed,
          delivery: tempDeliveryTerms,
          items: lineItems.map((item) => ({
            id: "temp-item",
            description: item.description || "",
            category: item.category || "unknown",
            quantity: item.quantity || 0,
            unit: item.unit || "ea",
            sku: item.sku,
            brand: item.brand,
            specs: item.specs,
            allowAlternates: item.allowAlternates,
          })),
        };
        
        // Debug logging (dev-only)
        if (process.env.NODE_ENV === "development") {
          console.debug("🔍 VALIDATION_DEBUG", {
            formFields: {
              requestedDate,
              location,
              fulfillmentType,
              actualDeliveryMode,
            },
            tempRequest: {
              delivery: tempRequest.delivery,
              itemsCount: tempRequest.items.length,
            },
          });
        }
        
        const validation = validateRequestDraft(tempRequest);
        
        // Debug logging (dev-only)
        if (process.env.NODE_ENV === "development") {
          console.debug("🔍 VALIDATION_RESULT", {
            isValid: validation.isValid,
            missingFields: validation.missingFields,
          });
        }
        
        // Only show modal if there are actually missing fields
        if (validation.missingFields.length > 0) {
          // Show clarification modal instead of blocking
          setMissingFields(validation.missingFields);
          setShowClarificationModal(true);
          setValidationErrors([]);
          return;
        }
        // If no missing fields, continue with posting (don't show modal)
        setValidationErrors([]);
        setShowClarificationModal(false);
      } catch (error) {
        // If we can't build a temp request, let the existing validation handle it
        console.error("Error validating request:", error);
      }
    }

    // GUARDRAIL: Check userId before proceeding
    if (!user?.id) {
      showToast({ type: "error", message: "Not signed in / userId missing — cannot create RFQ." });
      return;
    }

    // Validate preferred suppliers if routeMode is "preferred"
    if (sendMode === "preferred") {
      if (!selectedPreferredSupplierIds || selectedPreferredSupplierIds.length === 0) {
        showToast({ 
          type: "error", 
          message: "No preferred suppliers set for this category. Please select suppliers or choose Reverse Auction." 
        });
        return;
      }
    }

    // Build RFQ payload - API is source of truth
    // Server generates: id, rfqNumber, status, buyerId
    const rfqPayload = {
      title: jobName || "Untitled Request",
      notes: notes || "",
      categoryId: categoryId,
      category: categoryId ? categoryIdToLabel[categoryId] : undefined,
      visibility: sendMode === "preferred" ? "direct" : "broadcast",
      ...(sendMode === "preferred" && selectedPreferredSupplierIds.length > 0
        ? { targetSupplierIds: selectedPreferredSupplierIds }
        : {}),
      lineItems,
      terms: {
        fulfillmentType,
        requestedDate,
        ...(fulfillmentType === "DELIVERY" && {
          deliveryPreference,
          deliveryInstructions: deliveryInstructions.trim() || undefined,
          location: location.trim() || undefined,
        }),
      },
    };

    // Call API directly - canonical flow
    const response = await fetch("/api/buyer/rfqs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        buyerId: user.id,
        payload: rfqPayload,
      }),
    });

    if (!response.ok) {
      let errorMessage = "Failed to create RFQ";
      try {
        const errorData = await response.json();
        errorMessage = errorData.message || errorData.error || errorMessage;
      } catch {
        errorMessage = response.statusText || errorMessage;
      }
      showToast({ type: "error", message: errorMessage });
      return;
    }

    const result = await response.json();

    // Validate canonical response shape
    // API returns { ok: true, data: { id, rfqId, rfqNumber, status } }
    if (!result.ok || !result.data) {
      const missingFields = [];
      if (!result.ok) missingFields.push("ok");
      if (!result.data) missingFields.push("data");
      
      console.error("[RFQ_CREATE_INVALID_RESPONSE]", {
        status: response.status,
        result,
        missingFields,
        message: "Server returned invalid response shape",
      });
      
      showToast({ 
        type: "error", 
        message: `RFQ created but invalid response from server. Missing: ${missingFields.join(", ")}` 
      });
      return;
    }

    const rfqData = result.data;

    // Validate RFQ data fields
    if (!rfqData.rfqId || !rfqData.rfqNumber) {
      const missingFields = [];
      if (!rfqData.rfqId) missingFields.push("rfqId");
      if (!rfqData.rfqNumber) missingFields.push("rfqNumber");
      
      console.error("[RFQ_CREATE_INVALID_RESPONSE]", {
        status: response.status,
        result,
        missingFields,
        message: "Server returned invalid RFQ data shape",
      });
      
      showToast({ 
        type: "error", 
        message: `RFQ created but invalid response from server. Missing: ${missingFields.join(", ")}` 
      });
      return;
    }

    // Navigate to RFQ detail page using returned id (DB primary key)
    // CRITICAL: Use rfqData.id (canonical) or fallback to rfqData.rfqId for backward compatibility
    const rfqId = rfqData.id || rfqData.rfqId;
    if (!rfqId) {
      console.error("[RFQ_NAVIGATION_ERROR]", {
        result,
        message: "No RFQ id in response for navigation",
      });
      showToast({ type: "error", message: "RFQ created but unable to navigate to detail page" });
      return;
    }

    // Pass success state via query params so the detail page can show premium notification
    // This ensures the notification survives navigation and is visible on the destination page
    router.push(`/buyer/rfqs/${rfqId}?created=true&rfqNumber=${encodeURIComponent(rfqData.rfqNumber)}`);
  };

  // Determine current step based on form completion (0-indexed: 0=Details, 1=Line Items, 2=Terms, 3=Review)
  // Steps only show as complete when their required fields are actually filled
  useEffect(() => {
    // Step 0 (Details): requires jobName and categoryId
    const detailsComplete = jobName.trim().length > 0 && categoryId.length > 0;
    
    // Step 1 (Line Items): requires at least one valid line item
    const lineItemsComplete = validateLineItems();
    
    // Step 2 (Terms): requires requestedDate and valid location (if DELIVERY)
    const hasRequestedDate = validateRequestedDate();
    const locationValidation = validateLocation();
    const termsComplete = hasRequestedDate && locationValidation.valid;
    
    // Determine current active step
    if (!detailsComplete) {
      setCurrentStep(0); // Details step - not complete yet
    } else if (!lineItemsComplete) {
      setCurrentStep(1); // Line Items step - Details complete, working on Line Items
    } else if (!termsComplete) {
      setCurrentStep(2); // Terms step - Details and Line Items complete, working on Terms
    } else {
      setCurrentStep(3); // Review step - all steps complete
    }
  }, [jobName, categoryId, lineItems, requestedDate, fulfillmentType, location]);

  const handleReviewClick = () => {
    if (isFormValid()) {
      setShowReviewModal(true);
    }
  };

  const handleConfirmSubmit = (e: React.MouseEvent) => {
    e.preventDefault();
    setShowReviewModal(false);
    // Create a synthetic form event to pass to handleSubmit
    const syntheticEvent = {
      preventDefault: () => {},
    } as React.FormEvent;
    handleSubmit(syntheticEvent);
  };

  return (
    <>
    <div className="flex flex-1 px-6 py-8">
        <div className="w-full max-w-6xl mx-auto space-y-6">
          {/* Page Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-semibold text-black dark:text-zinc-50 mb-2">
              Create RFQ
            </h1>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Request pricing from suppliers in minutes
            </p>
          </div>

          {/* Stepper */}
          <div className="mb-8">
            <Stepper
              steps={["Details", "Line Items", "Terms", "Review"]}
              currentStep={currentStep}
            />
          </div>

          {/* Validation Errors */}
          {validationErrors.length > 0 && (
            <Card className="border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20">
              <CardContent className="p-4">
                <h3 className="text-sm font-semibold text-red-800 dark:text-red-200 mb-2">
                  Cannot post request. Missing required fields:
                </h3>
                <ul className="list-disc list-inside text-sm text-red-700 dark:text-red-300 space-y-1">
                  {validationErrors.map((field, index) => (
                    <li key={index}>{field}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {/* Draft Notice */}
          {isEditingDraft && (
            <Card className="border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20">
              <CardContent className="p-4">
                <p className="text-sm text-blue-800 dark:text-blue-200">
                  You are editing a draft. Save your changes or submit when ready.
                </p>
              </CardContent>
            </Card>
          )}

          {/* Two Column Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Left Column - Main Form */}
            <div className="lg:col-span-2 space-y-12">

              <form onSubmit={handleSubmit} className="space-y-12">
                {/* RFQ Details Section */}
                <div className="space-y-6">
                  <h2 className="text-xl font-semibold text-black dark:text-zinc-50">
                    RFQ Details
                  </h2>
                  <div className="space-y-6">
              <div>
                <label
                  htmlFor="title"
                  className="block text-sm font-medium text-black dark:text-zinc-50 mb-2"
                >
                  Title *
                </label>
                <input
                  type="text"
                  id="jobName"
                  value={jobName}
                  onChange={(e) => setJobName(e.target.value)}
                  className="w-full px-4 py-2.5 border border-zinc-200 dark:border-zinc-800 rounded-lg bg-white dark:bg-zinc-900 text-black dark:text-zinc-50 focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-zinc-50"
                  placeholder="e.g., 123 Main St Roof Replacement"
                />
              </div>

              <div>
                <label
                  htmlFor="category"
                  className="block text-sm font-medium text-black dark:text-zinc-50 mb-2"
                >
                  Category *
                </label>
                <select
                  id="category"
                  value={categoryId}
                  onChange={(e) => {
                    setCategoryId(e.target.value as CategoryId);
                    // Clear touched state when a valid category is selected
                    if (e.target.value && e.target.value.length > 0) {
                      setTouched((prev) => ({ ...prev, category: false }));
                    }
                  }}
                  onBlur={() => setTouched((prev) => ({ ...prev, category: true }))}
                  className={`w-full px-4 py-2.5 border rounded-lg bg-white dark:bg-zinc-900 text-black dark:text-zinc-50 focus:outline-none focus:ring-2 ${
                    shouldShowCategoryError()
                      ? "border-red-500 focus:ring-red-500"
                      : "border-zinc-200 dark:border-zinc-800 focus:ring-black dark:focus:ring-zinc-50"
                  }`}
                  required
                >
                  <option value="">Select a category</option>
                  {BUYER_CATEGORY_OPTIONS.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                {shouldShowCategoryError() && (
                  <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                    Category is required
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="notes"
                  className="block text-sm font-medium text-black dark:text-zinc-50 mb-2"
                >
                  Notes
                </label>
                <textarea
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={4}
                  className="w-full px-4 py-2.5 border border-zinc-200 dark:border-zinc-800 rounded-lg bg-white dark:bg-zinc-900 text-black dark:text-zinc-50 focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-zinc-50"
                  placeholder="Project details, delivery timing, preferred brands, or special instructions..."
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="substitutionsAllowed"
                  checked={substitutionsAllowed}
                  onChange={(e) => setSubstitutionsAllowed(e.target.checked)}
                  className="w-4 h-4 border border-zinc-300 dark:border-zinc-700 rounded bg-white dark:bg-zinc-900 text-black dark:text-zinc-50 focus:ring-2 focus:ring-black dark:focus:ring-zinc-50"
                />
                  <label
                    htmlFor="substitutionsAllowed"
                    className="text-sm font-medium text-black dark:text-zinc-50"
                  >
                    Allow substitutions for all items
                  </label>
                  </div>
                </div>
                </div>

                {/* Line Items Section */}
                <div data-line-items-section className="space-y-6">
                  <div className="flex items-center justify-between">
                    <h2 className="text-xl font-semibold text-black dark:text-zinc-50">
                      Line Items
                    </h2>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={addLineItem}
                    >
                      Add Line Item
                    </Button>
                  </div>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400 -mt-4">
                    Add each material you want priced.
                  </p>

                  <div className="space-y-4">
                    {lineItems.map((item, index) => {
                      const error = getLineItemError(index);
                      const hasError = !!error;
                      return (
                        <div 
                          key={index} 
                          className={`p-5 rounded-lg border ${
                            hasError 
                              ? "border-red-300 dark:border-red-700 bg-red-50/50 dark:bg-red-900/10" 
                              : "border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900"
                          } space-y-4`}
                        >
                            <div>
                              <label className="block text-sm font-medium text-black dark:text-zinc-50 mb-2">
                                Description *
                              </label>
                              <input
                                type="text"
                                value={item.description}
                                onChange={(e) =>
                                  updateLineItem(index, "description", e.target.value)
                                }
                                onBlur={() => {
                                  setTouched((prev) => {
                                    const newLineItems = [...prev.lineItems];
                                    newLineItems[index] = true;
                                    return { ...prev, lineItems: newLineItems };
                                  });
                                }}
                                className={`w-full px-4 py-2.5 border rounded-lg bg-white dark:bg-zinc-900 text-black dark:text-zinc-50 focus:outline-none focus:ring-2 ${
                                  hasError
                                    ? "border-red-500 focus:ring-red-500"
                                    : "border-zinc-200 dark:border-zinc-800 focus:ring-black dark:focus:ring-zinc-50"
                                }`}
                                placeholder="e.g., Architectural Asphalt Shingles"
                              />
                            </div>
                            <div className="flex gap-3 items-end">
                              <div className="flex-1">
                                <label className="block text-sm font-medium text-black dark:text-zinc-50 mb-2">
                                  Unit *
                                </label>
                                <select
                                  value={item.unit}
                                  onChange={(e) =>
                                    updateLineItem(index, "unit", e.target.value)
                                  }
                                  onBlur={() => {
                                    setTouched((prev) => {
                                      const newLineItems = [...prev.lineItems];
                                      newLineItems[index] = true;
                                      return { ...prev, lineItems: newLineItems };
                                    });
                                  }}
                                  className={`w-full px-4 py-2.5 border rounded-lg bg-white dark:bg-zinc-900 text-black dark:text-zinc-50 focus:outline-none focus:ring-2 ${
                                    hasError
                                      ? "border-red-500 focus:ring-red-500"
                                      : "border-zinc-200 dark:border-zinc-800 focus:ring-black dark:focus:ring-zinc-50"
                                  }`}
                                >
                                  {UNIT_OPTIONS.map((unit) => (
                                    <option key={unit.code} value={unit.code}>
                                      {unit.code} — {unit.label}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <div className="w-32">
                                <label className="block text-sm font-medium text-black dark:text-zinc-50 mb-2">
                                  Quantity *
                                </label>
                                <input
                                  type="number"
                                  value={item.quantity}
                                  onChange={(e) =>
                                    updateLineItem(
                                      index,
                                      "quantity",
                                      e.target.value === "" ? 0 : Number(e.target.value)
                                    )
                                  }
                                  onBlur={() => {
                                    setTouched((prev) => {
                                      const newLineItems = [...prev.lineItems];
                                      newLineItems[index] = true;
                                      return { ...prev, lineItems: newLineItems };
                                    });
                                  }}
                                  min="0"
                                  className={`w-full px-4 py-2.5 border rounded-lg bg-white dark:bg-zinc-900 text-black dark:text-zinc-50 focus:outline-none focus:ring-2 ${
                                    hasError
                                      ? "border-red-500 focus:ring-red-500"
                                      : "border-zinc-200 dark:border-zinc-800 focus:ring-black dark:focus:ring-zinc-50"
                                  }`}
                                  placeholder="0"
                                />
                              </div>
                              {lineItems.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => removeLineItem(index)}
                                  className="mb-0.5 px-3 py-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                                  aria-label="Remove line item"
                                >
                                  🗑️
                                </button>
                              )}
                            </div>
                          {error && (
                            <p className="text-sm text-red-600 dark:text-red-400">
                              {error}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  {getLineItemsError() && (
                    <p className="text-sm text-red-600 dark:text-red-400">
                      {getLineItemsError()}
                    </p>
                  )}
                </div>

                {/* Required Terms Section */}
                <div className="space-y-6">
                  <h2 className="text-xl font-semibold text-black dark:text-zinc-50">
                    Required Terms
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                      <div>
                        <label
                          htmlFor="fulfillmentType"
                          className="block text-sm font-medium text-black dark:text-zinc-50 mb-2"
                        >
                          Fulfillment Type *
                        </label>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-3">
                          Choose pickup or delivery
                        </p>
                        <select
                          id="fulfillmentType"
                          value={fulfillmentType}
                          onChange={(e) =>
                            setFulfillmentType(e.target.value as FulfillmentType)
                          }
                          className="w-full px-4 py-2.5 border border-zinc-200 dark:border-zinc-800 rounded-lg bg-white dark:bg-zinc-900 text-black dark:text-zinc-50 focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-zinc-50"
                        >
                          <option value="PICKUP">PICKUP</option>
                          <option value="DELIVERY">DELIVERY</option>
                        </select>
                      </div>

                      <div>
                        <label
                          htmlFor="requestedDate"
                          className="block text-sm font-medium text-black dark:text-zinc-50 mb-2"
                        >
                          {fulfillmentType === "PICKUP" ? "Pickup Date" : "Requested Delivery Date"} *
                        </label>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-3">
                          When you need the materials
                        </p>
                        <input
                          type="date"
                          id="requestedDate"
                          value={requestedDate}
                          onChange={(e) => setRequestedDate(e.target.value)}
                          onBlur={() => setTouched((prev) => ({ ...prev, requestedDate: true }))}
                          className={`w-full px-4 py-2.5 border rounded-lg bg-white dark:bg-zinc-900 text-black dark:text-zinc-50 focus:outline-none focus:ring-2 ${
                            getRequestedDateError()
                              ? "border-red-500 focus:ring-red-500"
                              : "border-zinc-200 dark:border-zinc-800 focus:ring-black dark:focus:ring-zinc-50"
                          }`}
                        />
                        {getRequestedDateError() && (
                          <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                            {getRequestedDateError()}
                          </p>
                        )}
                      </div>

                      {fulfillmentType === "DELIVERY" && (
                        <>
                          <div>
                            <label
                              htmlFor="deliveryPreference"
                              className="block text-sm font-medium text-black dark:text-zinc-50 mb-2"
                            >
                              Delivery Preference
                            </label>
                            <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-3">
                              Preferred delivery time
                            </p>
                            <select
                              id="deliveryPreference"
                              value={deliveryPreference}
                              onChange={(e) =>
                                setDeliveryPreference(e.target.value as "MORNING" | "ANYTIME")
                              }
                              className="w-full px-4 py-2.5 border border-zinc-200 dark:border-zinc-800 rounded-lg bg-white dark:bg-zinc-900 text-black dark:text-zinc-50 focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-zinc-50"
                            >
                              <option value="MORNING">MORNING</option>
                              <option value="ANYTIME">ANYTIME</option>
                            </select>
                          </div>

                          <div>
                            <label
                              htmlFor="deliveryInstructions"
                              className="block text-sm font-medium text-black dark:text-zinc-50 mb-2"
                            >
                              Special Delivery Instructions
                            </label>
                            <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-3">
                              Optional delivery notes
                            </p>
                            <textarea
                              id="deliveryInstructions"
                              value={deliveryInstructions}
                              onChange={(e) => setDeliveryInstructions(e.target.value)}
                              rows={3}
                              className="w-full px-4 py-2.5 border border-zinc-200 dark:border-zinc-800 rounded-lg bg-white dark:bg-zinc-900 text-black dark:text-zinc-50 focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-zinc-50"
                              placeholder="e.g., Use side entrance, call before delivery..."
                            />
                          </div>

                          <div className="md:col-span-2">
                            <label
                              htmlFor="location"
                              className="block text-sm font-medium text-black dark:text-zinc-50 mb-2"
                            >
                              Delivery Address *
                            </label>
                            <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-3">
                              Full address with street number, city, state, and ZIP
                            </p>
                            <input
                              type="text"
                              id="location"
                              value={location}
                              onChange={(e) => setLocation(e.target.value)}
                              onBlur={() => setTouched((prev) => ({ ...prev, location: true }))}
                              className={`w-full px-4 py-2.5 border rounded-lg bg-white dark:bg-zinc-900 text-black dark:text-zinc-50 focus:outline-none focus:ring-2 ${
                                getLocationError()
                                  ? "border-red-500 focus:ring-red-500"
                                  : "border-zinc-200 dark:border-zinc-800 focus:ring-black dark:focus:ring-zinc-50"
                              }`}
                              placeholder="204 Beirne Ave NW, Huntsville, AL 35801"
                            />
                            {getLocationError() && (
                              <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                                {getLocationError()}
                              </p>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                </div>

                {/* Send To Section */}
                <div className="space-y-6">
                  <h2 className="text-xl font-semibold text-black dark:text-zinc-50">
                    Send To
                  </h2>
                  <div className="space-y-4">
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input
                          type="radio"
                          name="sendMode"
                          value="broadcast"
                          checked={sendMode === "broadcast"}
                          onChange={(e) => {
                            setSendMode("broadcast");
                            setSelectedPreferredSupplierIds([]);
                          }}
                          className="w-4 h-4 text-black border-zinc-300 dark:border-zinc-700 focus:ring-black dark:focus:ring-zinc-50"
                        />
                        <div>
                          <span className="text-sm font-medium text-black dark:text-zinc-50">
                            Reverse Auction (send to everyone in category)
                          </span>
                          <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-0.5">
                            Broadcast to all suppliers who serve this category
                          </p>
                        </div>
                      </label>

                      <label className="flex items-center gap-3 cursor-pointer">
                        <input
                          type="radio"
                          name="sendMode"
                          value="preferred"
                          checked={sendMode === "preferred"}
                          onChange={(e) => setSendMode("preferred")}
                          className="w-4 h-4 text-black border-zinc-300 dark:border-zinc-700 focus:ring-black dark:focus:ring-zinc-50"
                        />
                        <div>
                          <span className="text-sm font-medium text-black dark:text-zinc-50">
                            Preferred suppliers
                          </span>
                          <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-0.5">
                            Direct invite to your preferred suppliers only
                          </p>
                        </div>
                      </label>
                    </div>

                    {sendMode === "preferred" && (
                      <div className="mt-6 pt-6 border-t border-zinc-200 dark:border-zinc-800">
                        {isLoadingPreferredSuppliers ? (
                          <p className="text-sm text-zinc-600 dark:text-zinc-400">
                            Loading preferred suppliers...
                          </p>
                        ) : preferredOptions.length === 0 ? (
                          <div className="text-sm text-zinc-600 dark:text-zinc-400 space-y-2">
                            <p>No preferred suppliers set for this category.</p>
                            <Link
                              href="/buyer/settings/preferred-suppliers"
                              className="text-black dark:text-zinc-50 underline hover:no-underline"
                            >
                              Set preferred suppliers →
                            </Link>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <label className="block text-sm font-medium text-black dark:text-zinc-50 mb-2">
                              Select suppliers ({selectedPreferredSupplierIds.length} selected)
                            </label>
                            <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-4 max-h-64 overflow-y-auto bg-white dark:bg-zinc-900">
                              <div className="flex flex-col gap-2">
                                {preferredOptions.map((supplier) => {
                                  const displayName = supplier.companyName || supplier.fullName || supplier.email || supplier.id;
                                  return (
                                    <label
                                      key={supplier.id}
                                      className="flex items-center gap-2 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800 p-2 rounded"
                                    >
                                      <input
                                        type="checkbox"
                                        checked={selectedPreferredSupplierIds.includes(supplier.id)}
                                        onChange={(e) => {
                                          if (e.target.checked) {
                                            setSelectedPreferredSupplierIds([...selectedPreferredSupplierIds, supplier.id]);
                                          } else {
                                            setSelectedPreferredSupplierIds(selectedPreferredSupplierIds.filter(id => id !== supplier.id));
                                          }
                                        }}
                                        className="w-4 h-4 text-black border-zinc-300 dark:border-zinc-700 rounded focus:ring-black dark:focus:ring-zinc-50"
                                      />
                                      <span className="text-sm text-black dark:text-zinc-50">
                                        {displayName}
                                      </span>
                                    </label>
                                  );
                                })}
                              </div>
                            </div>
                            {selectedPreferredSupplierIds.length === 0 && submitted && (
                              <p className="text-sm text-red-600 dark:text-red-400 mt-1">
                                Please select at least one supplier
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                </div>
              </form>
            </div>

            {/* Right Column - Summary */}
            <div className="lg:col-span-1">
              <SummaryCard
                lineItemCount={lineItems.length}
                fulfillmentType={fulfillmentType}
                requestedDate={requestedDate}
                isFormValid={isFormValid()}
                onReviewClick={handleReviewClick}
                onSaveDraft={handleSaveDraft}
                isEditingDraft={isEditingDraft}
              />
            </div>
          </div>

          {/* Bottom Action Bar */}
          <div className="flex gap-4 pt-8 mt-8 border-t border-zinc-200 dark:border-zinc-800">
            <Link href="/buyer/dashboard">
              <Button variant="outline" size="md">
                Cancel
              </Button>
            </Link>
          </div>
        </div>
      </div>
      
      {/* Review Confirmation Modal */}
      {showReviewModal && (
        <div className="fixed inset-0 bg-black/50 dark:bg-black/70 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-zinc-900 rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <h2 className="text-2xl font-semibold text-black dark:text-zinc-50 mb-4">
                Review & Submit RFQ
              </h2>
              
              <div className="space-y-4 mb-6">
                <div>
                  <h3 className="text-sm font-semibold text-black dark:text-zinc-50 mb-2">RFQ Details</h3>
                  <div className="space-y-1 text-sm text-zinc-600 dark:text-zinc-400">
                    <p><span className="font-medium">Title:</span> {jobName || "Not provided"}</p>
                    <p><span className="font-medium">Category:</span> {categoryId ? categoryIdToLabel[categoryId] : "Not selected"}</p>
                    {notes && <p><span className="font-medium">Notes:</span> {notes}</p>}
                    <p><span className="font-medium">Substitutions:</span> {substitutionsAllowed ? "Allowed" : "Not allowed"}</p>
                  </div>
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-black dark:text-zinc-50 mb-2">Line Items ({lineItems.length})</h3>
                  <div className="space-y-2 text-sm text-zinc-600 dark:text-zinc-400">
                    {lineItems.map((item, idx) => (
                      <p key={idx}>{item.description} - {item.quantity} {item.unit}</p>
                    ))}
                  </div>
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-black dark:text-zinc-50 mb-2">Terms</h3>
                  <div className="space-y-1 text-sm text-zinc-600 dark:text-zinc-400">
                    <p><span className="font-medium">Fulfillment:</span> {fulfillmentType}</p>
                    <p><span className="font-medium">Date:</span> {requestedDate ? new Date(requestedDate).toLocaleDateString() : "Not set"}</p>
                    {fulfillmentType === "DELIVERY" && location && (
                      <p><span className="font-medium">Address:</span> {location}</p>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex gap-4 justify-end">
                <Button
                  variant="outline"
                  size="md"
                  onClick={() => setShowReviewModal(false)}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  size="md"
                  onClick={handleConfirmSubmit}
                >
                  Confirm & Submit
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Clarification Modal - Only show if there are missing fields */}
      {showClarificationModal && missingFields.length > 0 && (
        <div className="fixed inset-0 bg-black/50 dark:bg-black/70 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-zinc-900 rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <h2 className="text-2xl font-semibold text-black dark:text-zinc-50 mb-4">
                Complete Required Fields
              </h2>
              <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-6">
                Please complete the following quote-critical fields before posting:
              </p>

              <div className="mb-6">
                <ul className="list-disc list-inside text-sm text-zinc-700 dark:text-zinc-300 space-y-2 mb-6">
                  {missingFields.map((field, index) => (
                    <li key={index}>{field}</li>
                  ))}
                </ul>
              </div>

              {/* Action buttons */}
              <div className="flex gap-4 justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setShowClarificationModal(false);
                    setMissingFields([]);
                  }}
                  className="px-6 py-3 border border-zinc-300 dark:border-zinc-700 rounded-lg font-medium hover:bg-zinc-100 dark:hover:bg-zinc-900 text-black dark:text-zinc-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    // Close modal
                    setShowClarificationModal(false);
                    
                    // Map first missing field to form field ID and scroll/focus
                    if (missingFields.length > 0) {
                      const firstField = missingFields[0];
                      let fieldId: string | null = null;
                      
                      // Map missing field names to form field IDs
                      if (firstField.includes("Category") || firstField.includes("category")) {
                        fieldId = "category";
                      } else if (firstField.includes("Need-by") || firstField.includes("need-by") || firstField.includes("Need-by date")) {
                        fieldId = "requestedDate";
                      } else if (firstField.includes("Delivery address") || firstField.includes("address")) {
                        fieldId = "location";
                      } else if (firstField.includes("delivery mode") || firstField.includes("Delivery mode")) {
                        fieldId = "fulfillmentType";
                      } else if (firstField.includes("Item") || firstField.includes("item")) {
                        // For line items, scroll to the line items section
                        // Find the first line item input
                        const lineItemSection = document.querySelector('[data-line-items-section]');
                        if (lineItemSection) {
                          lineItemSection.scrollIntoView({ behavior: "smooth", block: "center" });
                          // Try to focus the first line item description input
                          setTimeout(() => {
                            const firstLineItemInput = lineItemSection.querySelector('input[type="text"]') as HTMLInputElement;
                            firstLineItemInput?.focus();
                          }, 300);
                          return;
                        }
                      }
                      
                      // Scroll to and focus the field
                      if (fieldId) {
                        const fieldElement = document.getElementById(fieldId);
                        if (fieldElement) {
                          fieldElement.scrollIntoView({ behavior: "smooth", block: "center" });
                          setTimeout(() => {
                            fieldElement.focus();
                            // For select elements, also open the dropdown
                            if (fieldElement instanceof HTMLSelectElement) {
                              fieldElement.click();
                            }
                          }, 300);
                        }
                      }
                    }
                  }}
                  className="px-6 py-3 bg-black dark:bg-zinc-50 text-white dark:text-black rounded-lg font-medium hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors"
                >
                  Go to Missing Fields
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </>
  );
}

// Export with Suspense boundary to prevent useSearchParams from hanging SSR
// This is required in Next.js App Router when using useSearchParams in client components
// useSearchParams can suspend during SSR, causing RSC requests to hang without Suspense
export default function CreateRFQPage() {
  console.log("[SERVER/CLIENT] CreateRFQPage: wrapper render start");
  
  return (
    <Suspense fallback={
      <div className="flex flex-1 items-center justify-center">
        <p className="text-zinc-600 dark:text-zinc-400">Loading...</p>
      </div>
    }>
      <CreateRFQPageInner />
    </Suspense>
  );
}

