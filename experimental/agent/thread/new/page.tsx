"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { FEATURES } from "@/config/features";
import BuyerAgentClient from "../../BuyerAgentClient";

export default function NewAgentThreadPage() {
  const router = useRouter();

  useEffect(() => {
    if (!FEATURES.AGENT_ENABLED) {
      router.replace("/");
    }
  }, [router]);

  if (!FEATURES.AGENT_ENABLED) {
    return null;
  }

  return <BuyerAgentClient />;
}

