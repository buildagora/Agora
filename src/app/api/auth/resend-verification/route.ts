import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/db.server";
import { normalizeEmail } from "@/lib/auth/schemas";
import { generateVerificationToken, getVerificationTokenExpiration } from "@/lib/auth/verification.server";
import { sendVerificationEmail } from "@/lib/auth/verificationEmail.server";

/**
 * Resend verification email
 * POST /api/auth/resend-verification
 * Body: { email: string }
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        {
          ok: false,
          error: "BAD_REQUEST",
          message: "Invalid JSON",
        },
        { status: 400 }
      );
    }

    const email = (body as any)?.email;
    if (!email || typeof email !== "string" || !email.trim()) {
      return NextResponse.json(
        {
          ok: false,
          error: "BAD_REQUEST",
          message: "Email is required",
        },
        { status: 400 }
      );
    }

    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail) {
      return NextResponse.json(
        {
          ok: false,
          error: "BAD_REQUEST",
          message: "Invalid email address",
        },
        { status: 400 }
      );
    }

    const prisma = getPrisma();

    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    // Don't reveal if user exists or not (security best practice)
    // But we need to check if they're already verified
    if (user && user.emailVerified) {
      // User is already verified - return success but don't reveal this
      // This prevents email enumeration
      return NextResponse.json(
        {
          ok: true,
          message: "If an account exists and is unverified, a verification email has been sent.",
        },
        { status: 200 }
      );
    }

    if (!user) {
      // User doesn't exist - return same generic message
      return NextResponse.json(
        {
          ok: true,
          message: "If an account exists and is unverified, a verification email has been sent.",
        },
        { status: 200 }
      );
    }

    // User exists and is unverified - create new token
    const { rawToken, tokenHash } = generateVerificationToken();
    const expiresAt = getVerificationTokenExpiration();

    // Delete old verification tokens for this user (cleanup)
    await prisma.emailVerificationToken.deleteMany({
      where: { userId: user.id },
    }).catch(() => {
      // Ignore errors - tokens may not exist
    });

    // Create new verification token
    await prisma.emailVerificationToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt,
      },
    });

    // Send verification email
    try {
      await sendVerificationEmail({
        to: normalizedEmail,
        token: rawToken,
        userEmail: normalizedEmail,
      });

      console.log("[RESEND_VERIFICATION_EMAIL_SENT]", {
        userId: user.id,
        email: normalizedEmail,
      });

      return NextResponse.json(
        {
          ok: true,
          message: "If an account exists and is unverified, a verification email has been sent.",
        },
        { status: 200 }
      );
    } catch (emailError) {
      console.error("[RESEND_VERIFICATION_EMAIL_FAILED]", {
        userId: user.id,
        email: normalizedEmail,
        error: emailError instanceof Error ? emailError.message : String(emailError),
      });

      // Return generic success message even if email fails (security)
      return NextResponse.json(
        {
          ok: true,
          message: "If an account exists and is unverified, a verification email has been sent.",
        },
        { status: 200 }
      );
    }
  } catch (error) {
    console.error("[RESEND_VERIFICATION_ERROR]", {
      error: error instanceof Error ? error.message : String(error),
    });

    return NextResponse.json(
      {
        ok: false,
        error: "INTERNAL_ERROR",
        message: "Failed to process request",
      },
      { status: 500 }
    );
  }
}



