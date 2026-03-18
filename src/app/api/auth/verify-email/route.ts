import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/db.server";
import { hashVerificationToken } from "@/lib/auth/verification.server";

/**
 * Verify email using token from email link
 * GET /api/auth/verify-email?token=...
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token");

    if (!token || !token.trim()) {
      return NextResponse.json(
        {
          ok: false,
          error: "MISSING_TOKEN",
          message: "Verification token is required",
        },
        { status: 400 }
      );
    }

    const prisma = getPrisma();
    const tokenHash = hashVerificationToken(token.trim());

    // Find verification token
    const verificationToken = await prisma.emailVerificationToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!verificationToken) {
      return NextResponse.json(
        {
          ok: false,
          error: "INVALID_TOKEN",
          message: "Invalid or expired verification token",
        },
        { status: 400 }
      );
    }

    // Check if token is expired
    if (verificationToken.expiresAt < new Date()) {
      // Delete expired token
      await prisma.emailVerificationToken.delete({
        where: { id: verificationToken.id },
      });

      return NextResponse.json(
        {
          ok: false,
          error: "EXPIRED_TOKEN",
          message: "Verification token has expired. Please request a new verification email.",
        },
        { status: 400 }
      );
    }

    // Check if user is already verified (idempotent)
    if (verificationToken.user.emailVerified) {
      // Delete used token (cleanup)
      await prisma.emailVerificationToken.delete({
        where: { id: verificationToken.id },
      }).catch(() => {
        // Ignore deletion errors for already-verified users
      });

      return NextResponse.json(
        {
          ok: true,
          message: "Email is already verified",
          alreadyVerified: true,
        },
        { status: 200 }
      );
    }

    // Verify user email
    await prisma.$transaction(async (tx) => {
      // Mark email as verified
      await tx.user.update({
        where: { id: verificationToken.userId },
        data: {
          emailVerified: true,
          emailVerifiedAt: new Date(),
        },
      });

      // Delete verification token (one-time use)
      await tx.emailVerificationToken.delete({
        where: { id: verificationToken.id },
      });
    });

    console.log("[EMAIL_VERIFICATION_SUCCESS]", {
      userId: verificationToken.userId,
      email: verificationToken.user.email,
    });

    return NextResponse.json(
      {
        ok: true,
        message: "Email verified successfully",
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("[EMAIL_VERIFICATION_ERROR]", {
      error: error instanceof Error ? error.message : String(error),
    });

    return NextResponse.json(
      {
        ok: false,
        error: "INTERNAL_ERROR",
        message: "Failed to verify email",
      },
      { status: 500 }
    );
  }
}



