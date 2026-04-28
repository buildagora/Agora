/**
 * /contact-supplier/[supplierId]
 *
 * Anonymous-friendly form for sending a free-text message to a single
 * supplier. Reads optional ?q= search param to prefill the message.
 * On submit, POSTs to /api/buyer/material-requests in DIRECT mode and
 * navigates to /request/[id].
 */

import { notFound } from "next/navigation";
import SiteFooter from "@/components/layout/SiteFooter";
import SiteHeader from "@/components/layout/SiteHeader";
import { getPrisma } from "@/lib/db.server";
import ContactSupplierForm from "./ContactSupplierForm";

export const dynamic = "force-dynamic";

function formatCategory(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw
    .toLowerCase()
    .split("_")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" & ");
}

export default async function ContactSupplierPage({
  params,
  searchParams,
}: {
  params: Promise<{ supplierId: string }>;
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  const { supplierId } = await params;
  const { q } = await searchParams;
  const prefill = (Array.isArray(q) ? q[0] : q) ?? "";

  const prisma = getPrisma();
  const supplier = await prisma.supplier.findUnique({
    where: { id: supplierId },
    select: {
      id: true,
      name: true,
      category: true,
      city: true,
      state: true,
    },
  });
  if (!supplier) notFound();

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <SiteHeader />

      <main className="flex-1 px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
        <div className="mx-auto w-full max-w-xl">
          <header className="mb-6">
            <p className="text-xs uppercase tracking-wide text-zinc-500">
              Message supplier
            </p>
            <h1 className="mt-1 text-[22px] font-normal leading-snug text-zinc-900 sm:text-[26px]">
              {supplier.name}
            </h1>
            <p className="mt-1 text-sm text-zinc-500">
              {formatCategory(supplier.category)} · {supplier.city}, {supplier.state}
            </p>
          </header>

          <p className="mb-5 text-sm leading-relaxed text-zinc-600">
            Send a message describing what you need. They&apos;ll reply by text to
            the phone you enter — your number is never shared with the supplier.
          </p>

          <ContactSupplierForm
            supplierId={supplier.id}
            supplierName={supplier.name}
            categoryId={supplier.category}
            requestText={prefill}
            messagePrefill={prefill}
          />
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
