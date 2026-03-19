import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import InviteRedeemClient from "./InviteRedeemClient";
import Card, { CardContent, CardHeader } from "@/components/ui2/Card";
import Button from "@/components/ui2/Button";
import Link from "next/link";
import { getCurrentUserFromRequest } from "@/lib/auth/server";
import { getPrisma } from "@/lib/db.server";
import { createHash } from "crypto";

/**
 * Seller Team Invite Page - Server-Authoritative
 * 
 * This page makes server-side decisions about auth state and invite validity.
 * 
 * Behavior:
 * 1. No authenticated user → redirect to signup
 * 2. Authenticated user + email matches → show redeem UI
 * 3. Authenticated user + email mismatch → show mismatch UI with sign out CTA
 */
export default async function InviteRedeemPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  // Unwrap searchParams Promise (Next.js 15+)
  const resolvedSearchParams = await searchParams;
  const token = typeof resolvedSearchParams?.token === "string" ? resolvedSearchParams.token : null;

  // If no token, show invalid invitation message
  if (!token) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-zinc-50 px-6">
        <Card className="w-full max-w-md">
          <CardHeader>
            <h1 className="text-2xl font-semibold text-black">
              Invalid Invitation
            </h1>
          </CardHeader>
          <CardContent>
            <p className="text-zinc-600 mb-4">
              Invalid invitation link. Please check your email for the invitation link.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Hash token to find invite
  const tokenHash = createHash("sha256").update(token.trim()).digest("hex");
  const prisma = getPrisma();

  // Load invite
  const invite = await prisma.supplierInvite.findUnique({
    where: { tokenHash },
    include: {
      supplier: {
        select: { id: true, name: true },
      },
    },
  });

  if (!invite) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-zinc-50 px-6">
        <Card className="w-full max-w-md">
          <CardHeader>
            <h1 className="text-2xl font-semibold text-black">
              Invalid Invitation
            </h1>
          </CardHeader>
          <CardContent>
            <p className="text-zinc-600 mb-4">
              This invitation link is invalid or has expired. Please check your email for a valid invitation.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Check invite status
  if (invite.status !== "PENDING") {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-zinc-50 px-6">
        <Card className="w-full max-w-md">
          <CardHeader>
            <h1 className="text-2xl font-semibold text-black">
              Invitation Already Used
            </h1>
          </CardHeader>
          <CardContent>
            <p className="text-zinc-600 mb-4">
              This invitation has already been used or revoked.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Check expiration
  const now = new Date();
  if (invite.expiresAt < now) {
    // Mark as expired
    await prisma.supplierInvite.update({
      where: { id: invite.id },
      data: { status: "EXPIRED" },
    });
    return (
      <div className="flex min-h-dvh items-center justify-center bg-zinc-50 px-6">
        <Card className="w-full max-w-md">
          <CardHeader>
            <h1 className="text-2xl font-semibold text-black">
              Invitation Expired
            </h1>
          </CardHeader>
          <CardContent>
            <p className="text-zinc-600 mb-4">
              This invitation has expired. Please contact the team administrator for a new invitation.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Check authentication status on server
  const cookieStore = await cookies();
  const cookieHeader = cookieStore
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");
  
  // Create a Request-like object for getCurrentUserFromRequest
  const request = new Request("http://localhost", {
    headers: {
      cookie: cookieHeader,
    },
  });

  const currentUser = await getCurrentUserFromRequest(request);

  // STATE A: No authenticated user → redirect to signup
  if (!currentUser) {
    redirect(`/seller/team/invite/signup?token=${encodeURIComponent(token)}`);
  }

  // STATE B & C: Authenticated user → check email match
  const userEmail = currentUser.email?.toLowerCase() || "";
  const inviteEmail = invite.email?.toLowerCase() || "";

  // STATE C: Email mismatch → redirect to invite-specific signup flow
  // The signup page will handle:
  // - If account exists for invite email → redirect to sign-in with returnTo
  // - If account doesn't exist → show signup form, then redirect to sign-in with returnTo
  // After sign-in with correct email, user will return here and can redeem
  if (inviteEmail && userEmail !== inviteEmail) {
    // CRITICAL: Redirect to invite signup flow instead of showing static error
    // This actively recovers the user into the correct flow
    redirect(`/seller/team/invite/signup?token=${encodeURIComponent(token)}`);
  }

  // STATE B: Email matches → show redeem UI
  return (
    <div className="flex min-h-dvh items-center justify-center bg-zinc-50 px-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <h1 className="text-2xl font-semibold text-black">
            Accept Team Invitation
          </h1>
        </CardHeader>
        <CardContent>
          <p className="text-zinc-600 mb-4">
            You've been invited to join <strong>{invite.supplier.name}</strong> on Agora. Click the button below to accept the invitation.
          </p>
          {/* Client component only handles the redeem button click */}
          <InviteRedeemClient token={token} />
        </CardContent>
      </Card>
    </div>
  );
}
