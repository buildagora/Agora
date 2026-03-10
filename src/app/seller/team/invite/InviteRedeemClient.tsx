"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui2/Button";
import { fetchJson } from "@/lib/clientFetch";

interface InviteRedeemClientProps {
  token: string;
}

/**
 * InviteRedeemClient - Client component for invite redemption button
 * 
 * CRITICAL: This component NO LONGER handles auth checking or redirects.
 * The server page (page.tsx) handles all auth decisions server-side.
 * 
 * This component ONLY handles:
 * - Redeem button click and API calls
 * - Success/error states
 */
export default function InviteRedeemClient({ token }: InviteRedeemClientProps) {
  const router = useRouter();
  const [redeeming, setRedeeming] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const [supplierName, setSupplierName] = useState("");

  const handleRedeem = async () => {
    if (!token) {
      setError("No invite token provided");
      return;
    }

    setRedeeming(true);
    setError("");

    try {
      const result = await fetchJson("/api/seller/team/redeem", {
        method: "POST",
        body: JSON.stringify({ token }),
      });

      if (!result.ok) {
        const errorMessage = result.json?.message || result.json?.error || result.text || "Failed to redeem invite";
        setError(errorMessage);
        return;
      }

      setSuccess(true);
      setSupplierName(result.json?.supplierName || "Supplier");

      // Redirect after 2 seconds
      setTimeout(() => {
        router.push("/seller/settings/team");
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to redeem invite");
    } finally {
      setRedeeming(false);
    }
  };

  // Success state - replace the entire card content
  if (success) {
    return (
      <>
        <p className="text-zinc-600 dark:text-zinc-400 mb-4">
          You've successfully joined <strong>{supplierName}</strong> on Agora.
        </p>
        <p className="text-sm text-zinc-500 dark:text-zinc-500 mb-4">
          Redirecting to team settings...
        </p>
        <Button variant="primary" onClick={() => router.push("/seller/settings/team")}>
          Go to Team Settings
        </Button>
      </>
    );
  }

  // Main redeem UI - render button and error message
  return (
    <>
      {error && (
        <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded">
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}
      <Button
        variant="primary"
        onClick={handleRedeem}
        disabled={redeeming}
        className="w-full"
      >
        {redeeming ? "Accepting..." : "Accept Invitation"}
      </Button>
    </>
  );
}

