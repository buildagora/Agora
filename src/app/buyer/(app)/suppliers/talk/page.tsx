import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifyAuthToken, getAuthCookieName } from "@/lib/jwt";

/**
 * Legacy route: /buyer/suppliers/talk
 * Redirects authenticated buyers to the request/results hub.
 * Unauthenticated users still go through login with returnTo preserved.
 */
export default async function TalkToSuppliersPage({
  searchParams,
}: {
  searchParams: Promise<{ categoryId?: string; supplierId?: string }>;
}) {
  const cookieStore = await cookies();
  const cookieName = getAuthCookieName();
  const token = cookieStore.get(cookieName)?.value;

  if (!token) {
    const resolvedSearchParams = await searchParams;
    const supplierId = resolvedSearchParams.supplierId;
    const redirectUrl = supplierId
      ? `/buyer/suppliers/talk?supplierId=${supplierId}`
      : "/buyer/suppliers/talk";
    redirect(`/buyer/login?returnTo=${encodeURIComponent(redirectUrl)}`);
  }

  const payload = await verifyAuthToken(token);
  if (!payload) {
    const resolvedSearchParams = await searchParams;
    const supplierId = resolvedSearchParams.supplierId;
    const redirectUrl = supplierId
      ? `/buyer/suppliers/talk?supplierId=${supplierId}`
      : "/buyer/suppliers/talk";
    redirect(`/buyer/login?returnTo=${encodeURIComponent(redirectUrl)}`);
  }

  if (payload.activeRole !== "BUYER") {
    const resolvedSearchParams = await searchParams;
    const supplierId = resolvedSearchParams.supplierId;
    const redirectUrl = supplierId
      ? `/buyer/suppliers/talk?supplierId=${supplierId}`
      : "/buyer/suppliers/talk";
    redirect(`/buyer/login?returnTo=${encodeURIComponent(redirectUrl)}`);
  }

  await searchParams;
  redirect("/buyer/requests");
}
