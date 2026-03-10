import { redirect } from "next/navigation";

/**
 * Buyer Home - Redirects to Dashboard
 */
export default function BuyerPage() {
  redirect("/buyer/dashboard");
}
