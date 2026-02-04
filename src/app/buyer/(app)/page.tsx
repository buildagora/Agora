import { redirect } from "next/navigation";

/**
 * Buyer Home - Redirects to Agent (ChatGPT-style interface)
 */
export default function BuyerPage() {
  redirect("/buyer/agent");
}
