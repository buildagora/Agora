/**
 * Canonical auth handlers
 * Single implementation for each auth action
 */

import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/db.server";
import { signAuthToken, getAuthCookieName, verifyAuthToken } from "@/lib/jwt";
import { normalizeEmail, validateSignUpInput, validateLoginInput } from "./schemas";
import bcrypt from "bcryptjs";

/**
 * Standard error response shape
 */
export interface AuthErrorResponse {
  ok: false;
  error: string;
  message: string;
}

/**
 * Standard success response shape
 */
export interface AuthSuccessResponse<T = unknown> {
  ok: true;
  user?: T;
  [key: string]: unknown;
}

/**
 * User data shape returned by auth endpoints
 */
export interface AuthUser {
  id: string;
  email: string;
  role: "BUYER" | "SELLER";
  categoriesServed: string[];
}

/**
 * Create error response
 */
function errorResponse(error: string, message: string, status: number = 400): NextResponse<AuthErrorResponse> {
  return NextResponse.json(
    { ok: false, error, message },
    {
      status,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    }
  );
}

/**
 * Set authentication cookie on response
 * 
 * CRITICAL: Cookie MUST be set with path: "/" to apply to all routes including /seller/* and /buyer/*
 * 
 * This is the canonical function for setting auth cookies - used by both normal login and dev-login
 */
export function setAuthCookie(response: NextResponse, token: string): void {
  const cookieName = getAuthCookieName();
  const isProd = process.env.NODE_ENV === "production";

  // CRITICAL: Delete cookie across ALL paths before setting new one
  const pathsToClean = ["/", "/buyer", "/seller"];
  for (const path of pathsToClean) {
    response.cookies.set(cookieName, "", {
      httpOnly: true,
      secure: isProd,
      sameSite: "lax",
      path: path,
      maxAge: 0,
    });
    response.cookies.delete(cookieName, { path: path });
  }

  // Set new cookie with fresh token (only on path "/")
  // CRITICAL: path MUST be "/" to ensure cookie applies to all routes
  const cookieOptions = {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax" as const,
    path: "/",
    maxAge: 7 * 24 * 60 * 60, // 7 days
  };

  response.cookies.set(cookieName, token, cookieOptions);

  // Log cookie settings for debugging
  console.log("[AUTH_COOKIE_SET]", {
    name: cookieName,
    path: cookieOptions.path,
    secure: cookieOptions.secure,
    sameSite: cookieOptions.sameSite,
  });
}

/**
 * Clear authentication cookie on response
 */
function clearAuthCookie(response: NextResponse): void {
  const cookieName = getAuthCookieName();
  const isProd = process.env.NODE_ENV === "production";

  const pathsToClean = ["/", "/buyer", "/seller"];
  for (const path of pathsToClean) {
    response.cookies.set(cookieName, "", {
      httpOnly: true,
      secure: isProd,
      sameSite: "lax",
      path: path,
      maxAge: 0,
    });
    response.cookies.delete(cookieName, { path: path });
  }
}

/**
 * Format user data for response
 */
function formatUser(user: {
  id: string;
  email: string;
  role: "BUYER" | "SELLER";
  categoriesServed?: string | string[] | null;
  companyName?: string | null;
  fullName?: string | null;
}): AuthUser {
  // Parse categoriesServed (can be string JSON or array)
  let categoriesServed: string[] = [];
  if (user.categoriesServed) {
    if (Array.isArray(user.categoriesServed)) {
      categoriesServed = user.categoriesServed;
    } else if (typeof user.categoriesServed === "string") {
      try {
        categoriesServed = JSON.parse(user.categoriesServed);
      } catch {
        categoriesServed = [];
      }
    }
  }
  
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    categoriesServed,
  };
}

/**
 * Sign-up handler
 */
export async function signUpHandler(request: NextRequest): Promise<NextResponse<AuthSuccessResponse<AuthUser> | AuthErrorResponse>> {
  try {
    // Parse request body
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return errorResponse("invalid_input", "Invalid JSON", 400);
    }

    // Validate input
    const validation = validateSignUpInput(body);
    if (!validation.success) {
      return errorResponse("invalid_input", validation.error, 400);
    }

    const { email, password, role, fullName, companyName, phone, categoriesServed, serviceArea } = validation.data;
    const normalizedEmail = normalizeEmail(email);

    if (!normalizedEmail) {
      return errorResponse("invalid_input", "Email is required", 400);
    }

    // TASK 2: Explicit role validation - ensure role is strictly BUYER or SELLER
    if (!role || (role !== "BUYER" && role !== "SELLER")) {
      return errorResponse("invalid_input", "Role must be BUYER or SELLER", 400);
    }

    // CRITICAL: For SELLER signup, require companyName or fullName
    if (role === "SELLER") {
      if (!companyName?.trim() && !fullName?.trim()) {
        return errorResponse(
          "invalid_input",
          "Company name or full name is required for seller accounts",
          400
        );
      }
    }

    // Get Prisma client
    const prisma = getPrisma();

    // Check if user already exists
    let existingUser;
    try {
      existingUser = await prisma.user.findUnique({
        where: { email: normalizedEmail },
      });
    } catch (prismaError: any) {
      const errorCode = prismaError?.code;
      const errorMessage = prismaError?.message || String(prismaError);

      // Log error (dev only, no password)
      if (process.env.NODE_ENV !== "production") {
        console.error("[SIGNUP_PRISMA_ERROR]", {
          step: "existing user check",
          operation: "findUnique",
          model: "User",
          error: errorMessage,
          code: errorCode,
        });
      }

      // Handle specific Prisma error codes
      if (errorCode === "P2022") {
        return errorResponse(
          "internal_error",
          "Database schema mismatch. Please run 'npm run db:migrate:dev' to sync the database.",
          500
        );
      }

      if (errorCode === "P1001") {
        return errorResponse("internal_error", "Cannot connect to database. Please check DATABASE_URL.", 500);
      }

      return errorResponse("internal_error", "Failed to check existing user", 500);
    }

    // If user exists, return 409
    if (existingUser) {
      return errorResponse("user_exists", "An account already exists for that email", 409);
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Prepare user data
    const userData: any = {
      email: normalizedEmail,
      passwordHash,
      role,
    };
    
    // Add optional fields if provided
    if (fullName?.trim()) {
      userData.fullName = fullName.trim();
    }
    if (companyName?.trim()) {
      userData.companyName = companyName.trim();
    }
    if (phone?.trim()) {
      userData.phone = phone.trim();
    }
    if (categoriesServed && Array.isArray(categoriesServed) && categoriesServed.length > 0) {
      userData.categoriesServed = JSON.stringify(categoriesServed);
    }
    if (serviceArea?.trim()) {
      userData.serviceArea = serviceArea.trim();
    }

    // Create user
    let user;
    try {
      user = await prisma.user.create({
        data: userData,
      });
    } catch (prismaError: any) {
      const errorCode = prismaError?.code;

      // Log error clearly (email + role, no password)
      console.error("[SIGNUP_PRISMA_ERROR]", {
        step: "create user",
        operation: "create",
        model: "User",
        email: normalizedEmail,
        role: role,
        error: prismaError?.message || String(prismaError),
        code: errorCode,
      });

      // Handle Prisma unique constraint violation (P2002) as user_exists
      if (errorCode === "P2002" && prismaError?.meta?.target?.includes("email")) {
        return errorResponse("user_exists", "An account already exists for that email", 409);
      }

      if (errorCode === "P2022") {
        return errorResponse(
          "internal_error",
          "Database schema mismatch. Please run 'npm run db:migrate:dev' to sync the database.",
          500
        );
      }

      return errorResponse("internal_error", "Failed to create user", 500);
    }

    // TASK 1: VERIFY the returned user object exists and has an id
    if (!user || !user.id) {
      console.error("[SIGNUP_VERIFICATION_FAILED]", {
        email: normalizedEmail,
        role: role,
        userExists: !!user,
        userId: user?.id || "missing",
      });
      return errorResponse("internal_error", "User creation failed: user object invalid", 500);
    }

    // TASK 4: DEV-ONLY hard guarantee check
    if (process.env.NODE_ENV !== "production") {
      const verifyUser = await prisma.user.findUnique({
        where: { email: normalizedEmail },
      });

      if (!verifyUser) {
        console.error("[SIGNUP_FAILED_TO_PERSIST_USER]", {
          email: normalizedEmail,
          role: role,
          userId: user.id,
          message: "User was created but immediately query returned null",
        });
        return errorResponse("internal_error", "SIGNUP FAILED TO PERSIST USER", 500);
      }

      if (verifyUser.id !== user.id) {
        console.error("[SIGNUP_ID_MISMATCH]", {
          email: normalizedEmail,
          role: role,
          createdUserId: user.id,
          queriedUserId: verifyUser.id,
        });
        return errorResponse("internal_error", "User creation verification failed: ID mismatch", 500);
      }
    }

    // Return success (sign-up does NOT auto-login)
    return NextResponse.json(
      {
        ok: true,
        user: formatUser(user),
      },
      {
        status: 200,
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      }
    );
  } catch (error: any) {
    console.error("[SIGNUP_FATAL]", {
      error: error?.message || String(error),
    });

    return errorResponse("internal_error", "An unexpected error occurred", 500);
  }
}

/**
 * Login handler
 */
export async function loginHandler(request: NextRequest): Promise<NextResponse<AuthSuccessResponse<AuthUser> | AuthErrorResponse>> {
  try {
    // Parse request body
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return errorResponse("invalid_input", "Invalid JSON", 400);
    }

    // Validate input
    const validation = validateLoginInput(body);
    if (!validation.success) {
      return errorResponse("bad_request", validation.error, 400);
    }
    const loginData = validation.data;

    const normalizedEmail = normalizeEmail(loginData.email);

    // Get Prisma client
    const prisma = getPrisma();

    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    // Return generic error for invalid credentials (don't reveal if email exists)
    if (!user) {
      return errorResponse("invalid_credentials", "Invalid email or password", 401);
    }

    // Validate password - ALWAYS use bcrypt.compare
    const passwordMatches = await bcrypt.compare(
      loginData.password,
      user.passwordHash
    );

    if (!passwordMatches) {
      return errorResponse(
        "invalid_credentials",
        "Invalid email or password",
        401
      );
    }

    // Create JWT
    const token = await signAuthToken({ userId: user.id });

    // Create response with user data
    const response = NextResponse.json(
      {
        ok: true,
        user: formatUser(user),
      },
      {
        status: 200,
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      }
    );

    // Set cookie
    setAuthCookie(response, token);

    return response;
  } catch (error: any) {
    console.error("[AUTH_LOGIN_ERROR]", {
      error: error?.message || String(error),
    });

    return errorResponse("internal_error", "Internal server error", 500);
  }
}

/**
 * Me handler (get current user)
 * 
 * CRITICAL: Uses requireCurrentUserFromRequest as single source of truth
 * This ensures dev header support (x-dev-user-id) works consistently
 * across all auth endpoints
 */
export async function meHandler(request: NextRequest): Promise<NextResponse<AuthSuccessResponse<AuthUser> | { ok: false; user: null }>> {
  try {
    // Use requireCurrentUserFromRequest as single source of truth
    // This handles both cookie auth (production) and x-dev-user-id (development)
    const { requireCurrentUserFromRequest } = await import("./server");
    
    let user;
    try {
      // Convert NextRequest to Request for requireCurrentUserFromRequest
      const requestObj = new Request(request.url, {
        method: request.method,
        headers: request.headers,
      });
      user = await requireCurrentUserFromRequest(requestObj);
    } catch {
      // User not authenticated - return 401 UNAUTHORIZED
      return NextResponse.json(
        {
          ok: false,
          user: null,
          error: "UNAUTHORIZED",
          message: "Authentication required",
          diagnostics: process.env.NODE_ENV !== "production"
            ? { hasCookie: false, verifyOk: false }
            : undefined,
        },
        {
          status: 401,
          headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
        }
      );
    }

    // User is authenticated - format and return
    const prisma = getPrisma();
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
    });

    if (!dbUser) {
      // User ID in token but user not found in DB - return 401 UNAUTHORIZED
      return NextResponse.json(
        {
          ok: false,
          user: null,
          error: "UNAUTHORIZED",
          message: "User not found",
          diagnostics: process.env.NODE_ENV !== "production"
            ? { hasCookie: true, verifyOk: true, userNotFound: true }
            : undefined,
        },
        {
          status: 401,
          headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
        }
      );
    }

    // Return authenticated user
    return NextResponse.json(
      {
        ok: true,
        user: formatUser(dbUser),
        diagnostics: process.env.NODE_ENV !== "production"
          ? {
              hasCookie: true,
              verifyOk: true,
            }
          : undefined,
      },
      {
        status: 200,
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      }
    );
  } catch (error: any) {
    console.error("[AUTH_ME_ERROR]", {
      error: error?.message || String(error),
    });

    return NextResponse.json(
      {
        ok: false,
        user: null,
        error: "internal_error",
      },
      {
        status: 500,
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      }
    );
  }
}

/**
 * Logout handler
 */
export async function logoutHandler(_request: NextRequest): Promise<NextResponse<AuthSuccessResponse>> {
  const response = NextResponse.json(
    { ok: true },
    {
      status: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    }
  );

  clearAuthCookie(response);

  return response;
}
