/**
 * DEV ONLY: Minimal dev login page
 * For local development - creates/authenticates a dev user
 * 
 * Server-side gating: Only accessible if:
 * - NODE_ENV !== "production"
 * - ENABLE_DEV_LOGIN === "true"
 */

import { notFound, redirect } from "next/navigation";
import DevLoginForm from "./DevLoginForm";

export default function DevLoginPage() {
  // Server-side gating (production-safe)
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  if (process.env.ENABLE_DEV_LOGIN !== "true") {
    // Redirect to sign-in if not enabled
    redirect("/auth/sign-in");
  }

  // Render client component for interactive form
  return <DevLoginForm />;
}
