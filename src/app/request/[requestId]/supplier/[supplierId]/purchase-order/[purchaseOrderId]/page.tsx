import Link from "next/link";
import { notFound } from "next/navigation";
import SiteFooter from "@/components/layout/SiteFooter";
import SiteHeader from "@/components/layout/SiteHeader";
import { getPrisma } from "@/lib/db.rsc";
import ReviewOrderRequestForm from "./ReviewOrderRequestForm";

export const revalidate = 0;

type PageProps = {
  params: Promise<{
    requestId: string;
    supplierId: string;
    purchaseOrderId: string;
  }>;
};

function formatDateInputValue(value: Date | null | undefined): string {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

function decimalToInputValue(value: unknown): string {
  if (value == null) return "";
  return String(value);
}

export default async function PurchaseOrderDraftPage({ params }: PageProps) {
  const { requestId, supplierId, purchaseOrderId } = await params;
  if (!requestId?.trim() || !supplierId?.trim() || !purchaseOrderId?.trim()) {
    notFound();
  }

  const prisma = getPrisma();
  const purchaseOrder = await prisma.purchaseOrder.findFirst({
    where: {
      id: purchaseOrderId.trim(),
      supplierId: supplierId.trim(),
      materialRequestId: requestId.trim(),
    },
    include: {
      supplier: { select: { name: true } },
      items: {
        orderBy: { createdAt: "asc" },
        take: 1,
      },
    },
  });

  if (!purchaseOrder) {
    notFound();
  }

  const item = purchaseOrder.items[0];

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50">
      <SiteHeader />

      <main className="flex-1 px-4 py-6 sm:px-6 sm:py-10 lg:px-8">
        <div className="mx-auto w-full max-w-2xl">
          <Link
            href={`/request/${requestId}/supplier/${supplierId}`}
            className="text-sm font-medium text-zinc-600 hover:text-zinc-900"
          >
            ← Back to supplier
          </Link>

          <header className="mt-6">
            <h1 className="text-2xl font-bold tracking-tight text-zinc-900">
              Review order request
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-zinc-600">
              Confirm the details before sending this to the supplier.
            </p>
            <p className="mt-4 text-sm font-medium text-zinc-900">
              {purchaseOrder.supplier.name}
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              Draft · {purchaseOrder.status}
            </p>
          </header>

          <div className="mt-6">
            <ReviewOrderRequestForm
              purchaseOrderId={purchaseOrder.id}
              productName={item?.productName ?? "—"}
              originalSearchText={item?.originalSearchText ?? "—"}
              sourceListingUrl={item?.sourceListingUrl ?? null}
              initialQuantity={decimalToInputValue(item?.quantity)}
              initialUnit={item?.unit ?? ""}
              initialSpecNotes={purchaseOrder.notes ?? ""}
              initialRequestedDate={formatDateInputValue(
                purchaseOrder.requestedDeliveryDate,
              )}
              initialDeliveryNotes=""
            />
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
