import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export interface PO {
  id: string;
  poNumber: string;
  rfqId: string;
  winningBidId: string;
  buyerName: string;
  sellerName: string;
  issuedAt: string;
  lineItems: Array<{
    description: string;
    unit: string;
    quantity: number;
    unitPrice: number;
    total: number;
  }>;
  subtotal: number;
  taxes: number;
  total: number;
  fulfillmentType: string;
  requestedDate?: string;
  deliveryPreference?: string;
  deliveryInstructions?: string;
  location?: string;
  notes?: string;
}

/**
 * Generate Purchase Order PDF and return as Uint8Array
 * This is the single source of truth for PO PDF generation
 * Used by both download and email flows
 */
export function generatePurchaseOrderPdfBytes(po: PO): Uint8Array {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 20;
  let yPos = margin;

  // Title
  doc.setFontSize(20);
  doc.setFont("helvetica", "bold");
  doc.text("Purchase Order", margin, yPos);
  yPos += 15;

  // PO Number and Date
  doc.setFontSize(12);
  doc.setFont("helvetica", "normal");
  doc.text(`PO Number: ${po.poNumber}`, margin, yPos);
  doc.text(`Date: ${new Date(po.issuedAt).toLocaleDateString("en-US")}`, pageWidth - margin - 40, yPos);
  yPos += 10;

  // RFQ Number
  doc.setFontSize(10);
  doc.text(`RFQ: ${po.rfqId}`, margin, yPos);
  yPos += 15;

  // Buyer and Seller Info
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("Buyer:", margin, yPos);
  doc.text("Seller:", pageWidth / 2 + margin, yPos);
  yPos += 7;

  doc.setFont("helvetica", "normal");
  doc.text(po.buyerName, margin, yPos);
  doc.text(po.sellerName, pageWidth / 2 + margin, yPos);
  yPos += 15;

  // Fulfillment Details
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text("Fulfillment Details:", margin, yPos);
  yPos += 7;

  doc.setFont("helvetica", "normal");
  doc.text(`Type: ${po.fulfillmentType}`, margin, yPos);
  yPos += 5;
  if (po.requestedDate) {
    doc.text(
      `${po.fulfillmentType === "PICKUP" ? "Pickup" : "Delivery"} Date: ${new Date(po.requestedDate).toLocaleDateString()}`,
      margin,
      yPos
    );
    yPos += 5;
  }
  if (po.deliveryPreference) {
    doc.text(`Delivery Preference: ${po.deliveryPreference}`, margin, yPos);
    yPos += 5;
  }
  if (po.location) {
    doc.text(`Location: ${po.location}`, margin, yPos);
    yPos += 5;
  }
  if (po.deliveryInstructions) {
    doc.text(`Delivery Instructions: ${po.deliveryInstructions}`, margin, yPos);
    yPos += 5;
  }
  yPos += 5;

  // Line Items Table
  autoTable(doc, {
    startY: yPos,
    head: [["Description", "Unit", "Quantity", "Unit Price", "Total"]],
    body: po.lineItems.map((item) => {
      // Safely convert unitPrice and total to numbers (handle string values from API)
      const unitPrice = typeof item.unitPrice === "number" ? item.unitPrice : parseFloat(String(item.unitPrice || 0));
      const total = typeof item.total === "number" ? item.total : parseFloat(String(item.total || 0));
      
      return [
        item.description,
        item.unit,
        item.quantity.toString(),
        `$${unitPrice.toFixed(2)}`,
        `$${total.toFixed(2)}`,
      ];
    }),
    theme: "striped",
    headStyles: { fillColor: [0, 0, 0], textColor: 255 },
    styles: { fontSize: 9 },
    columnStyles: {
      0: { cellWidth: 80 },
      1: { cellWidth: 30 },
      2: { cellWidth: 30 },
      3: { cellWidth: 35 },
      4: { cellWidth: 35 },
    },
  });

  const finalY = (doc as any).lastAutoTable.finalY || yPos + 50;

  // Totals (safely convert to numbers in case they're strings)
  const subtotal = typeof po.subtotal === "number" ? po.subtotal : parseFloat(String(po.subtotal || 0));
  const taxes = typeof po.taxes === "number" ? po.taxes : parseFloat(String(po.taxes || 0));
  const total = typeof po.total === "number" ? po.total : parseFloat(String(po.total || 0));
  
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`Subtotal: $${subtotal.toFixed(2)}`, pageWidth - margin - 50, finalY + 10, { align: "right" });
  doc.text(`Taxes: $${taxes.toFixed(2)}`, pageWidth - margin - 50, finalY + 15, { align: "right" });
  doc.setFont("helvetica", "bold");
  doc.text(`Total: $${total.toFixed(2)}`, pageWidth - margin - 50, finalY + 22, { align: "right" });

  // Notes
  if (po.notes) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text("Notes:", margin, finalY + 30);
    const splitNotes = doc.splitTextToSize(po.notes, pageWidth - 2 * margin);
    doc.text(splitNotes, margin, finalY + 35);
  }

  // Return PDF as Uint8Array
  const arrayBuffer = doc.output("arraybuffer");
  return new Uint8Array(arrayBuffer);
}

/**
 * Download Purchase Order PDF to browser
 * Uses generatePurchaseOrderPdfBytes() as the single source of truth
 */
export function downloadPoPdf(po: PO): void {
  const pdfBytes = generatePurchaseOrderPdfBytes(po);
  // Create Blob from Uint8Array - create a new Uint8Array to ensure proper type
  const uint8Array = new Uint8Array(pdfBytes);
  const blob = new Blob([uint8Array], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${po.poNumber}.pdf`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Email Purchase Order PDF to the specified recipient
 * Uses generatePurchaseOrderPdfBytes() as the single source of truth
 * @param po Purchase Order object
 * @param recipientEmail Email address to send to
 * @param rfqNumber RFQ number for email subject
 * @returns Promise with result { ok: boolean, messageId?: string, error?: string }
 */
export async function emailPurchaseOrder(
  po: PO,
  recipientEmail: string,
  rfqNumber: string
): Promise<{ ok: boolean; messageId?: string; error?: string; to?: string }> {
  // Generate PDF bytes (same as download)
  const pdfBytes = generatePurchaseOrderPdfBytes(po);
  
  // Validate PDF was generated
  if (!pdfBytes || pdfBytes.length === 0) {
    return {
      ok: false,
      error: "PDF_GENERATION_FAILED",
    };
  }

  // Convert Uint8Array to base64 for email attachment
  // Use chunked approach to avoid "Maximum call stack size exceeded" for large PDFs
  let base64Pdf = "";
  const chunkSize = 8192;
  for (let i = 0; i < pdfBytes.length; i += chunkSize) {
    const chunk = pdfBytes.slice(i, i + chunkSize);
    base64Pdf += String.fromCharCode(...chunk);
  }
  base64Pdf = btoa(base64Pdf);

  // Call API route to send email
  try {
    const response = await fetch("/api/email-po", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        to: recipientEmail,
        subject: `Purchase Order ${po.poNumber} for RFQ ${rfqNumber}`,
        body: "Attached is your Purchase Order.",
        attachment: {
          filename: `${po.poNumber}.pdf`,
          content: base64Pdf,
          type: "application/pdf",
        },
      }),
    });

    const result = await response.json();

    if (!result.ok) {
      return {
        ok: false,
        error: result.error || "EMAIL_SEND_FAILED",
        to: recipientEmail,
      };
    }

    return {
      ok: true,
      messageId: result.messageId,
      to: result.to || recipientEmail,
    };
  } catch (error: any) {
    console.error("❌ EMAIL_PO_FETCH_ERROR", {
      error: error.message,
      to: recipientEmail,
    });

    return {
      ok: false,
      error: "NETWORK_ERROR",
      to: recipientEmail,
    };
  }
}
