import { redirect } from "next/navigation";
import { FEATURES } from "@/config/features";

export default function BuyerAgentPage() {
  if (!FEATURES.AGENT_ENABLED) {
    redirect("/");
    return null;
  }
  redirect("/buyer/agent/thread/new");
}
