import { redirect } from "next/navigation";

/**
 * Supplier Inbox Landing Page
 * 
 * This page handles email links from supplier message notifications.
 * For now, it redirects to the buyer thread view so we can verify the link works.
 * 
 * TODO: Implement supplier authentication and real seller-side conversation UI.
 */
export default async function SupplierInboxPage({
  searchParams,
}: {
  searchParams: Promise<{ conversationId?: string; supplierId?: string; from?: string }>;
}) {
  const params = await searchParams;
  const { conversationId, supplierId } = params;

  // Validate required parameters
  if (!conversationId || !supplierId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-black">
        <div className="text-center">
          <h1 className="text-2xl font-semibold text-black dark:text-zinc-50 mb-2">
            Invalid Link
          </h1>
          <p className="text-zinc-600 dark:text-zinc-400">
            Missing required parameters. Please check your email link.
          </p>
        </div>
      </div>
    );
  }

  // For now, redirect to buyer thread page so we can verify the link works
  // TODO: Implement supplier authentication and real seller-side conversation UI
  redirect(`/buyer/suppliers/talk/${supplierId}?conversationId=${conversationId}&from=email`);
}

