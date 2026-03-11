import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export interface PO {
  id: string;
  poNumber: string;
  rfqId: string;
  rfqNumber?: string; // Friendly RFQ number (e.g., "RFQ-24-0001")
  winningBidId: string;
  buyerName: string;
  buyerPhone?: string;
  buyerEmail?: string;
  buyerAddress?: string;
  sellerName: string;
  sellerEmail?: string;
  sellerPhone?: string;
  sellerAddress?: string;
  issuedAt: string;
  lineItems: Array<{
    description: string;
    unit: string;
    quantity: number;
    unitPrice: number;
    total: number;
    sku?: string;
  }>;
  subtotal: number;
  taxes: number;
  shipping?: number;
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
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 20;
  
  // Simple colors
  const darkGray: [number, number, number] = [51, 65, 85]; // #334155 - dark gray for text
  const lightGray: [number, number, number] = [226, 232, 240]; // #E2E8F0 - light gray for table lines
  
  let yPos = margin;

  // ============================================
  // HEADER SECTION (Clean & Minimal)
  // ============================================
  
  // Title: "AGORA PURCHASE ORDER"
  doc.setFontSize(24);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
  doc.text("AGORA PURCHASE ORDER", margin, yPos);
  
  yPos += 16;
  
  // Metadata (right-aligned)
  const poDate = new Date(po.issuedAt).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
  
  // PO Number (right-aligned)
  doc.text(`PO Number: ${po.poNumber}`, pageWidth - margin, yPos, { align: "right" });
  yPos += 6;
  
  // PO Date (right-aligned)
  doc.text(`PO Date: ${poDate}`, pageWidth - margin, yPos, { align: "right" });
  yPos += 6;
  
  // RFQ Reference (right-aligned)
  if (po.rfqNumber) {
    doc.text(`RFQ Reference: ${po.rfqNumber}`, pageWidth - margin, yPos, { align: "right" });
  }
  
  yPos += 24;

  // ============================================
  // BUYER / SUPPLIER SECTION (Clean Two-Column)
  // ============================================
  
  const sectionWidth = (pageWidth - 2 * margin - 20) / 2;
  const buyerX = margin;
  const supplierX = margin + sectionWidth + 20;
  
  // BILL TO (left-aligned)
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
  let buyerY = yPos;
  doc.text("Bill To", buyerX, buyerY);
  buyerY += 7;
  
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(po.buyerName, buyerX, buyerY);
  buyerY += 6;
  
  if (po.buyerPhone) {
    doc.text(po.buyerPhone, buyerX, buyerY);
    buyerY += 6;
  }
  
  // SUPPLIER (right-aligned)
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
  let supplierY = yPos;
  doc.text("Supplier", supplierX, supplierY);
  supplierY += 7;
  
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(po.sellerName, supplierX, supplierY);
  
  yPos = Math.max(buyerY, supplierY) + 24;

  // ============================================
  // FULFILLMENT SECTION (Clean Single Row)
  // ============================================
  
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
  
  const fulfillmentLabel = po.fulfillmentType === "PICKUP" ? "Pickup" : 
                           po.fulfillmentType === "DELIVERY" ? "Delivery" : 
                           po.fulfillmentType || "Not specified";
  
  let fulfillmentText = `Fulfillment: ${fulfillmentLabel}`;
  
  if (po.requestedDate) {
    const dateLabel = po.fulfillmentType === "PICKUP" ? "Pickup Date" : "Delivery Date";
    const formattedDate = new Date(po.requestedDate).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
    fulfillmentText += `  |  ${dateLabel}: ${formattedDate}`;
  }
  
  doc.text(fulfillmentText, margin, yPos);
  yPos += 16;

  // ============================================
  // LINE ITEM TABLE (Clean with Light Grid)
  // ============================================
  
  autoTable(doc, {
    startY: yPos,
    head: [["#", "Description", "Qty", "Unit Price", "Total"]],
    body: po.lineItems.map((item, index) => {
      // Safely convert unitPrice and total to numbers
      const unitPrice = typeof item.unitPrice === "number" ? item.unitPrice : parseFloat(String(item.unitPrice || 0));
      const total = typeof item.total === "number" ? item.total : parseFloat(String(item.total || 0));
      
      return [
        (index + 1).toString(),
        item.description || "",
        item.quantity.toString(),
        `$${unitPrice.toFixed(2)}`,
        `$${total.toFixed(2)}`,
      ];
    }),
    theme: "plain",
    headStyles: { 
      fillColor: [255, 255, 255],
      textColor: darkGray,
      fontStyle: "bold",
      fontSize: 9,
      cellPadding: { top: 8, bottom: 8, left: 5, right: 5 },
      lineColor: lightGray,
      lineWidth: 0.3,
    },
    bodyStyles: {
      fontSize: 9,
      textColor: darkGray,
      cellPadding: { top: 6, bottom: 6, left: 5, right: 5 },
      lineColor: lightGray,
      lineWidth: 0.2,
    },
    columnStyles: {
      0: { cellWidth: 15, halign: "left" }, // #
      1: { cellWidth: "auto", halign: "left" }, // Description
      2: { cellWidth: 25, halign: "right" }, // Qty
      3: { cellWidth: 40, halign: "right" }, // Unit Price
      4: { cellWidth: 40, halign: "right" }, // Total
    },
    styles: { 
      lineColor: lightGray,
      lineWidth: 0.2,
    },
    margin: { left: margin, right: margin },
    tableWidth: "wrap",
  });

  const finalY = (doc as any).lastAutoTable.finalY || yPos + 50;

  // ============================================
  // PAYMENT SUMMARY (Bottom Right, No Box)
  // ============================================
  
  // Total content (safely convert to number)
  // CRITICAL: TOTAL DUE equals the awarded bid total only (no tax added)
  // Tax will be handled later when the order is entered into the supplier's ERP system
  const total = typeof po.total === "number" ? po.total : parseFloat(String(po.total || 0));
  
  const totalsWidth = 80;
  const totalsX = pageWidth - margin - totalsWidth;
  let totalsY = finalY + 24;
  
  // TOTAL DUE (bold and slightly larger)
  // This is the supplier's quoted price / awarded bid total
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
  doc.text("TOTAL DUE", totalsX, totalsY, { align: "right" });
  doc.setFontSize(12);
  doc.text(`$${total.toFixed(2)}`, pageWidth - margin, totalsY, { align: "right" });

  // ============================================
  // AUTHORIZATION (Bottom Left)
  // ============================================
  
  const authY = finalY + 24;
  
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
  doc.text("Authorized By", margin, authY);
  
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(po.buyerName, margin, authY + 8);

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
