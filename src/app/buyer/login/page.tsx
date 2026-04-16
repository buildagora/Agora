import { redirect } from "next/navigation";
import { sanitizeReturnTo } from "@/lib/auth/routeIntent";

/**
 * Buyer login URL — forwards directly to the sign-in form with role=buyer.
 * Preserves returnTo / next query params (sanitized).
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{
    returnTo?: string | string[];
    next?: string | string[];
  }>;
}) {
  const sp = await searchParams;
  const urlParams = new URLSearchParams();
  urlParams.set("role", "buyer");

  const rawReturnTo = sp.returnTo ?? sp.next;
  if (rawReturnTo) {
    const returnToValue = Array.isArray(rawReturnTo)
      ? rawReturnTo[0]
      : rawReturnTo;
    const sanitized = sanitizeReturnTo(returnToValue);
    if (sanitized) {
      urlParams.set("returnTo", sanitized);
    }
  }

  redirect(`/auth/sign-in?${urlParams.toString()}`);
}
