/**
 * Canonical auth handlers
 * Single implementation for each auth action
 */

import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/db.server";
import { Prisma } from "@prisma/client";
import { signAuthToken, getAuthCookieName, verifyAuthToken } from "@/lib/jwt";
import { normalizeEmail, validateSignUpInput, validateLoginInput } from "./schemas";
import { labelToCategoryId, type CategoryId } from "@/lib/categoryIds";
import bcrypt from "bcryptjs";
import { serialize } from "cookie";

/**
 * Standard error response shape
 */
export interface AuthErrorResponse {
  ok: false;
  user: null;
  error: string;
  message: string;
}

/**
 * Standard success response shape
 */
export interface AuthSuccessResponse<T = unknown> {
  ok: true;
  user: T;
  [key: string]: unknown;
}

/**
 * User data shape returned by auth endpoints
 */
export interface AuthUser {
  id: string;
  email: string;
  role: "BUYER" | "SELLER"; // Alias for activeRole (backward compatibility)
  activeRole: "BUYER" | "SELLER"; // REQUIRED - the currently active role for this session
  roles: ("BUYER" | "SELLER")[]; // All roles this user has
  categoriesServed: string[];
  companyName?: string;
  fullName?: string;
  phone?: string;
  createdAt?: string;
  serviceArea?: string;
}

/**
 * Create error response
 */
function errorResponse(
  error: string,
  message: string,
  status: number = 400,
  diagnostics?: unknown
): NextResponse<AuthErrorResponse & { diagnostics?: unknown }> {
  const payload: AuthErrorResponse & { diagnostics?: unknown } = {
    ok: false as const,
    user: null,
    error,
    message,
  };
  if (diagnostics !== undefined) {
    payload.diagnostics = diagnostics;
  }
  return NextResponse.json(payload, {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

/**
 * Create success response
 * CRITICAL: keep ok as literal true (never widen)
 */
function successResponse<T>(
  body: { user: T } & Omit<AuthSuccessResponse<T>, "ok" | "user"> & { ok?: true },
  status: number = 200
): NextResponse<AuthSuccessResponse<T>> {
  // CRITICAL: keep ok as literal true (never widen)
  const payload: AuthSuccessResponse<T> = { ok: true as const, ...body };
  return NextResponse.json(payload, {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
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

  // CRITICAL: Clear cookie on all paths first to prevent stale cookies
  // Use manual Set-Cookie headers to ensure all paths are cleared
  for (const path of ["/", "/buyer", "/seller"]) {
    response.headers.append(
      "Set-Cookie",
      serialize(cookieName, "", {
        path,
        expires: new Date(0),
        httpOnly: true,
        sameSite: "lax",
        secure: isProd,
      })
    );
  }

  // Set new cookie with fresh token on path "/"
  // CRITICAL: Use manual Set-Cookie header to ensure path="/" is correctly set
  // response.cookies.set() may not reliably set path="/" in all Next.js versions
  response.headers.append(
    "Set-Cookie",
    serialize(cookieName, token, {
      path: "/", // CRITICAL: Must be "/" to apply to all routes including /signup and /api/auth/me
      httpOnly: true,
      secure: isProd,
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60, // 7 days
    })
  );

  // Log cookie settings for debugging
  console.log("[AUTH_COOKIE_SET]", {
    name: cookieName,
    path: "/",
    secure: isProd,
    sameSite: "lax",
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
    // Clear the real auth cookie (agora.auth)
    response.cookies.set(cookieName, "", {
      httpOnly: true,
      secure: isProd,
      sameSite: "lax",
      path: path,
      maxAge: 0,
    });
    response.cookies.delete({ name: cookieName, path });
    
    // Defensively clear dev_login_token cookie if it exists (stale dev cookie)
    // This ensures sign-out clears ALL auth-related cookies
    response.cookies.set("dev_login_token", "", {
      httpOnly: false, // May not be HttpOnly if it was set by client
      secure: isProd,
      sameSite: "lax",
      path: path,
      maxAge: 0,
    });
    response.cookies.delete({ name: "dev_login_token", path });
  }
}

/**
 * Format user data for response
 * CRITICAL: Always includes both `role` (alias) and `activeRole` for backward compatibility
 */
function formatUser(user: {
  id: string;
  email: string;
  role: "BUYER" | "SELLER";
  activeRole: "BUYER" | "SELLER";
  roles: ("BUYER" | "SELLER")[];
  categoriesServed?: string | string[] | null;
  companyName?: string | null;
  fullName?: string | null;
  phone?: string | null;
  createdAt?: string | null;
  serviceArea?: string | null;
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
  
  // CRITICAL: Always include both `role` (alias) and `activeRole` for backward compatibility
  return {
    id: user.id,
    email: user.email,
    role: user.activeRole, // Alias for backward compatibility
    activeRole: user.activeRole,
    roles: user.roles,
    categoriesServed,
    companyName: user.companyName || undefined,
    fullName: user.fullName || undefined,
    phone: user.phone || undefined,
    createdAt: user.createdAt || undefined,
    serviceArea: user.serviceArea || undefined,
  };
}

/**
 * Sign-up handler
 */
export async function signUpHandler(request: NextRequest): Promise<NextResponse<AuthSuccessResponse<AuthUser> | AuthErrorResponse>> {
  try {
    // DEV-ONLY: Log incoming request
    if (process.env.NODE_ENV === "development") {
      console.log("[AUTH_SIGNUP_IN]", { 
        url: request.url,
        method: request.method,
      });
    }

    // Parse request body
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return errorResponse("BAD_REQUEST", "Invalid JSON", 400);
    }

    // Extract email and role for logging (before validation)
    const bodyEmail = (body as any)?.email;
    const bodyRole = (body as any)?.role;
    const agreedToTerms = (body as any)?.agreedToTerms;
    const claimSupplierId = (body as any)?.supplierId; // Optional: for claiming existing supplier org

    // DEV-ONLY: Log parsed body (sanitized)
    if (process.env.NODE_ENV === "development") {
      console.log("[AUTH_SIGNUP_IN]", { 
        email: bodyEmail,
        role: bodyRole,
        agreedToTerms,
      });
    }

    // Validate agreement checkbox
    if (!agreedToTerms || agreedToTerms !== true) {
      return errorResponse("BAD_REQUEST", "You must agree to the End User Service Agreement to create an account", 400);
    }

    // Extract and normalize categories from raw body (supports categoryIds, categoriesServed, categories, or categoryId)
    // Priority: categoryIds > categoriesServed > categories > categoryId
    const rawCategoryData = (body as any)?.categoryIds 
      ?? (body as any)?.categoriesServed 
      ?? (body as any)?.categories 
      ?? (body as any)?.categoryId;
    const rawCategoryArray = Array.isArray(rawCategoryData) 
      ? rawCategoryData 
      : (typeof rawCategoryData === "string" ? [rawCategoryData] : []);

    // Normalize categories: convert labels to categoryIds
    const normalizedCategoryIds: CategoryId[] = [];
    const seenIds = new Set<string>();
    for (const entry of rawCategoryArray) {
      if (!entry) continue; // Skip falsy values
      const trimmed = String(entry).trim();
      if (!trimmed) continue; // Skip empty strings
      
      // Check if it's a label (e.g., "Roofing", "HVAC", "ROOFING") - case-insensitive
      const lowerTrimmed = trimmed.toLowerCase();
      let foundCategoryId: CategoryId | null = null;
      
      // Try exact label match (case-insensitive)
      for (const [label, categoryId] of Object.entries(labelToCategoryId)) {
        if (label.toLowerCase() === lowerTrimmed) {
          foundCategoryId = categoryId;
          break;
        }
      }
      
      // If not found as label, check if it's already a valid categoryId (case-insensitive)
      if (!foundCategoryId) {
        const validCategoryIds = Object.values(labelToCategoryId) as CategoryId[];
        for (const categoryId of validCategoryIds) {
          if (categoryId.toLowerCase() === lowerTrimmed) {
            foundCategoryId = categoryId;
            break;
          }
        }
      }
      
      // If still not found, assume it's already a DB categoryId and use as-is
      if (!foundCategoryId) {
        foundCategoryId = trimmed as CategoryId;
      }
      
      // De-dupe: only add if we haven't seen this ID before
      if (foundCategoryId && !seenIds.has(foundCategoryId)) {
        normalizedCategoryIds.push(foundCategoryId);
        seenIds.add(foundCategoryId);
      }
    }

    // Validate input (this will validate the rest of the body)
    const validation = validateSignUpInput(body);
    if (!validation.success) {
      // Return structured error with validation details
      const errorMessage = validation.error || "Invalid input";
      const details = validation.error?.includes("Zod") ? undefined : validation.error;
      return errorResponse("BAD_REQUEST", errorMessage, 400, details);
    }

    const { email, password, role, fullName, companyName, phone, serviceArea } = validation.data;
    const normalizedEmail = normalizeEmail(email);

    if (!normalizedEmail) {
      return errorResponse("BAD_REQUEST", "Email is required", 400);
    }

    // TASK 2: Explicit role validation - ensure role is strictly BUYER or SELLER
    if (!role || (role !== "BUYER" && role !== "SELLER")) {
      return errorResponse("BAD_REQUEST", "Role must be BUYER or SELLER", 400);
    }

    // CRITICAL: Supplier claim/invite flows may ONLY create seller accounts
    // If supplierId is present, this is a supplier invite/claim signup and must create a SELLER account
    // This prevents users from accidentally or maliciously creating BUYER accounts via supplier invite links
    if (claimSupplierId && String(claimSupplierId).trim() && role !== "SELLER") {
      return errorResponse(
        "BAD_REQUEST",
        "Supplier invite links must create seller accounts",
        400
      );
    }

    // CRITICAL: Require phone for both BUYER and SELLER
    if (!phone?.trim()) {
      return errorResponse("BAD_REQUEST", "Phone is required", 400);
    }

    // CRITICAL: For SELLER signup, require companyName or fullName
    if (role === "SELLER") {
      if (!companyName?.trim() && !fullName?.trim()) {
        return errorResponse(
          "BAD_REQUEST",
          "Company name or full name is required for seller accounts",
          400
        );
      }
      // CRITICAL: For SELLER signup, require normalized categories
      if (normalizedCategoryIds.length === 0) {
        // DEV-ONLY: Log debug info before returning error
        if (process.env.NODE_ENV === "development") {
          console.log("[SIGNUP_DEBUG_SELLER_CATEGORIES]", { 
            received: rawCategoryArray,
            normalizedCategoryIds,
            rawBodyCategoryIds: (body as any)?.categoryIds,
            rawBodyCategoriesServed: (body as any)?.categoriesServed,
            rawBodyCategories: (body as any)?.categories,
            rawBodyCategoryId: (body as any)?.categoryId,
          });
        }
        return errorResponse(
          "BAD_REQUEST",
          "At least one category is required for seller accounts",
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

    // Use normalizedCategoryIds (already computed from raw body above)
    // This handles categoryIds, categories, and categoryId from the request body

    // FINAL INVARIANT: SELLER users MUST have categories before Prisma create
    if (role === "SELLER" && normalizedCategoryIds.length === 0) {
      return errorResponse(
        "BAD_REQUEST",
        "At least one category is required for seller accounts",
        400
      );
    }

    // Prepare user data with required fields
    const userData: {
      email: string;
      passwordHash: string;
      role: string;
      fullName?: string;
      companyName?: string;
      phone?: string;
      categoriesServed?: string;
      serviceArea?: string;
      agreedToTermsAt?: Date;
      agreedToTermsVersion?: string;
    } = {
      email: normalizedEmail,
      passwordHash, // CRITICAL: Required field
      role, // CRITICAL: Required field
      agreedToTermsAt: new Date(),
      agreedToTermsVersion: "v1-beta",
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
    
    // CRITICAL: SELLER users ALWAYS get categoriesServed (not conditional)
    if (role === "SELLER") {
      userData.categoriesServed = JSON.stringify(normalizedCategoryIds);
    } else if (normalizedCategoryIds.length > 0) {
      // For non-SELLER users, only set if categories are provided
      userData.categoriesServed = JSON.stringify(normalizedCategoryIds);
    }
    
    if (serviceArea?.trim()) {
      userData.serviceArea = serviceArea.trim();
    }

    // DEV-ONLY: Diagnostic log before Prisma create
    if (process.env.NODE_ENV === "development") {
      console.log("[SIGNUP_PRISMA_CREATE_DEBUG]", {
        normalizedEmail,
        role,
        normalizedCategoryIds,
        userDataKeys: Object.keys(userData),
      });
    }

    // Create user with proper Prisma error handling
    let user;
    try {
      // For SELLER users, create User, Supplier, and SupplierMember in a transaction
      if (role === "SELLER") {
        const result = await prisma.$transaction(async (tx) => {
          // Create user
          const newUser = await tx.user.create({
            data: userData,
          });

            // CRITICAL: Check if this is a claim signup (supplierId provided)
            if (claimSupplierId && typeof claimSupplierId === "string" && claimSupplierId.trim()) {
              // CLAIM FLOW: Link user to existing supplier org (do NOT create new Supplier)
              const existingSupplier = await tx.supplier.findUnique({
                where: { id: claimSupplierId.trim() },
              });

              if (!existingSupplier) {
                // Throw error to be caught by outer catch block
                throw new Error(`SUPPLIER_NOT_FOUND: Supplier with ID ${claimSupplierId} not found`);
              }

            // Check if user is already a member of this supplier
            const existingMember = await tx.supplierMember.findFirst({
              where: {
                supplierId: existingSupplier.id,
                userId: newUser.id,
              },
            });

            if (existingMember) {
              // User is already a member - this shouldn't happen for new signups, but handle gracefully
              console.warn("[SUPPLIER_CLAIM_SIGNUP_DUPLICATE_MEMBER]", {
                supplierId: existingSupplier.id,
                userId: newUser.id,
                email: normalizedEmail,
              });
            } else {
              // Create supplier member linking user to existing supplier
              await tx.supplierMember.create({
                data: {
                  supplierId: existingSupplier.id,
                  userId: newUser.id,
                  role: "ADMIN", // First claimed account is ADMIN
                  status: "ACTIVE",
                  verifiedAt: new Date(),
                },
              });
            }

            // Log claim signup success
            console.log("[SUPPLIER_CLAIM_SIGNUP]", {
              supplierId: existingSupplier.id,
              supplierName: existingSupplier.name,
              email: normalizedEmail,
              createdUserId: newUser.id,
              createdMembership: true,
              createdSupplier: false, // CRITICAL: No new Supplier row created
            });

            return newUser;
          } else {
            // NORMAL FLOW: Create new Supplier org (existing behavior)
            // Create supplier
            const supplierName = companyName?.trim() || fullName?.trim() || normalizedEmail;
            const supplierCategory = normalizedCategoryIds.length > 0 
              ? normalizedCategoryIds[0].toUpperCase() 
              : "OTHER"; // Default category if none provided
            
            const supplier = await tx.supplier.create({
              data: {
                name: supplierName,
                category: supplierCategory,
                street: "", // Placeholder - can be updated later
                city: "", // Placeholder - can be updated later
                state: "", // Placeholder - can be updated later
                zip: "", // Placeholder - can be updated later
                email: normalizedEmail,
                phone: phone?.trim() || null,
                onboarded: false,
              },
            });

            // Create supplier member
            await tx.supplierMember.create({
              data: {
                supplierId: supplier.id,
                userId: newUser.id,
                role: "ADMIN",
                status: "ACTIVE",
                verifiedAt: new Date(),
              },
            });

            return newUser;
          }
        });
        user = result;
      } else {
        // For BUYER users, just create the user
        user = await prisma.user.create({
          data: userData,
        });
      }
    } catch (prismaError: unknown) {
      // Handle supplier not found error (from claim flow)
      if (prismaError instanceof Error && prismaError.message.startsWith("SUPPLIER_NOT_FOUND:")) {
        return errorResponse(
          "NOT_FOUND",
          `Supplier not found. Please check your signup link.`,
          404
        );
      }

      // DEV-ONLY: Log detailed Prisma error
      console.error("[AUTH_SIGNUP_ERROR]", {
        name: prismaError instanceof Error ? prismaError.constructor.name : typeof prismaError,
        message: prismaError instanceof Error ? prismaError.message : String(prismaError),
        ...(prismaError instanceof Prisma.PrismaClientKnownRequestError && {
          code: prismaError.code,
          meta: prismaError.meta,
        }),
        ...(prismaError instanceof Prisma.PrismaClientValidationError && {
          validationError: true,
        }),
        email: normalizedEmail,
        role: role,
      });

      // Handle Prisma known request errors
      if (prismaError instanceof Prisma.PrismaClientKnownRequestError) {
        const errorCode = prismaError.code;
        const errorMeta = prismaError.meta;

        // P2002: Unique constraint violation
        if (errorCode === "P2002") {
          const target = Array.isArray(errorMeta?.target) ? errorMeta.target : [];
          if (target.includes("email")) {
            return errorResponse(
              "user_exists",
              "An account already exists for that email",
              409,
              process.env.NODE_ENV === "development" ? {
                prismaCode: errorCode,
                prismaMeta: errorMeta,
                prismaMessage: prismaError.message.substring(0, 500),
              } : undefined
            );
          }
          // Other unique constraint violations
          return errorResponse(
            "BAD_REQUEST",
            "A record with this information already exists",
            400,
            process.env.NODE_ENV === "development" ? {
              prismaCode: errorCode,
              prismaMeta: errorMeta,
              prismaMessage: prismaError.message.substring(0, 500),
            } : undefined
          );
        }

        // P2022: Schema mismatch
        if (errorCode === "P2022") {
          return errorResponse(
            "INTERNAL_ERROR",
            "Database schema mismatch. Please run 'npm run db:migrate:dev' to sync the database.",
            500,
            process.env.NODE_ENV === "development" ? {
              prismaCode: errorCode,
              prismaMeta: errorMeta,
              prismaMessage: prismaError.message.substring(0, 500),
            } : undefined
          );
        }

        // P1001, P1002, P1008: Connection errors
        if (["P1001", "P1002", "P1008"].includes(errorCode)) {
          return errorResponse(
            "INTERNAL_ERROR",
            "Cannot connect to database. Please check DATABASE_URL.",
            500,
            process.env.NODE_ENV === "development" ? {
              prismaCode: errorCode,
              prismaMeta: errorMeta,
              prismaMessage: prismaError.message.substring(0, 500),
            } : undefined
          );
        }

        // Other known request errors - return 400 for validation-like errors, 500 for others
        const isValidationError = ["P2003", "P2004", "P2011", "P2012", "P2013", "P2014", "P2015", "P2016", "P2017", "P2018", "P2019", "P2020", "P2021", "P2023", "P2024", "P2025"].includes(errorCode);
        return errorResponse(
          isValidationError ? "BAD_REQUEST" : "INTERNAL_ERROR",
          isValidationError ? "Invalid data provided" : "Failed to create user",
          isValidationError ? 400 : 500,
          process.env.NODE_ENV === "development" ? {
            prismaCode: errorCode,
            prismaMeta: errorMeta,
            prismaMessage: prismaError.message.substring(0, 500),
          } : undefined
        );
      }

      // Handle Prisma validation errors
      if (prismaError instanceof Prisma.PrismaClientValidationError) {
        return errorResponse(
          "BAD_REQUEST",
          "Invalid data provided. Please check all required fields.",
          400,
          process.env.NODE_ENV === "development" ? {
            prismaMessage: prismaError.message.substring(0, 500),
          } : undefined
        );
      }

      // Unknown error
      return errorResponse(
        "INTERNAL_ERROR",
        "Failed to create user",
        500,
        process.env.NODE_ENV === "development" ? {
          prismaMessage: prismaError instanceof Error ? prismaError.message.substring(0, 500) : String(prismaError).substring(0, 500),
        } : undefined
      );
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

    // Narrow user.role to ensure type safety (avoid shadowing the role variable from validation)
    const userRole = user.role === "BUYER" || user.role === "SELLER" ? user.role : null;
    if (!userRole) return errorResponse("internal_error", "Invalid user role", 500);

    // For signup, activeRole is the same as the role being created
    const activeRole: "BUYER" | "SELLER" = userRole;
    const userRoles: ("BUYER" | "SELLER")[] = [userRole]; // For now, single role

    const safeUser = formatUser({
      id: user.id,
      email: user.email,
      role: userRole,
      activeRole,
      roles: userRoles,
      categoriesServed: user.categoriesServed,
      companyName: user.companyName,
      fullName: user.fullName,
    });

    // Log success (always, not just dev)
    console.log("[AUTH_SIGNUP_OK]", { 
      userId: user.id,
      email: user.email,
      role: userRole,
    });

    // Return success (sign-up does NOT auto-login)
    return successResponse<AuthUser>({ user: safeUser }, 200);
  } catch (error: any) {
    // DEV-ONLY: Log error
    if (process.env.NODE_ENV === "development") {
      console.error("[AUTH_SIGNUP_ERR]", { 
        message: String(error),
        error: error?.message || String(error),
        stack: error?.stack,
      });
    }

    return errorResponse("INTERNAL_ERROR", "Signup failed", 500);
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

    // Narrow role to ensure type safety
    const role = user.role === "BUYER" || user.role === "SELLER" ? user.role : null;
    if (!role) return errorResponse("internal_error", "Invalid user role", 500);

    // Set activeRole: use database role (for now, users have single role in DB)
    // TODO: If users can have multiple roles, default to BUYER if user has both
    const activeRole: "BUYER" | "SELLER" = role;
    const userRoles: ("BUYER" | "SELLER")[] = [role]; // For now, single role

    // Create JWT with activeRole
    const token = await signAuthToken({ userId: user.id, activeRole });

    const safeUser = formatUser({
      id: user.id,
      email: user.email,
      role,
      activeRole,
      roles: userRoles,
      categoriesServed: user.categoriesServed,
      companyName: user.companyName,
      fullName: user.fullName,
    });

    // Create response with user data
    const response = successResponse<AuthUser>({ user: safeUser }, 200);
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
export async function meHandler(request: NextRequest): Promise<NextResponse<AuthSuccessResponse<AuthUser> | AuthErrorResponse>> {
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
      return errorResponse(
        "UNAUTHORIZED",
        "Authentication required",
        401,
        process.env.NODE_ENV !== "production"
          ? { hasCookie: false, verifyOk: false }
          : undefined
      );
    }

    // User is authenticated - format and return
    const prisma = getPrisma();
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
    });

    if (!dbUser) {
      // User ID in token but user not found in DB - return 401 UNAUTHORIZED
      return errorResponse(
        "UNAUTHORIZED",
        "User not found",
        401,
        process.env.NODE_ENV !== "production"
          ? { hasCookie: true, verifyOk: true, userNotFound: true }
          : undefined
      );
    }

    // Read activeRole from JWT token (canonical source of truth)
    // Get JWT token from request to read activeRole
    const { verifyAuthToken, getAuthCookieName } = await import("../jwt");
    const cookieHeader = request.headers.get("cookie");
    let activeRole: "BUYER" | "SELLER" = "BUYER"; // Default fallback
    let userRoles: ("BUYER" | "SELLER")[] = ["BUYER"]; // Default fallback

    if (cookieHeader) {
      const cookies = cookieHeader.split(";").reduce((acc, cookie) => {
        const [key, value] = cookie.trim().split("=");
        if (key && value) {
          acc[key] = decodeURIComponent(value);
        }
        return acc;
      }, {} as Record<string, string>);

      const token = cookies[getAuthCookieName()];
      if (token) {
        const payload = await verifyAuthToken(token);
        if (payload) {
          activeRole = payload.activeRole;
        }
      }
    }

    // Narrow role to ensure type safety
    const role = dbUser.role === "BUYER" || dbUser.role === "SELLER" ? dbUser.role : null;
    if (!role) return errorResponse("internal_error", "Invalid user role", 500);

    // For now, users have single role in DB
    userRoles = [role];
    // If activeRole from JWT doesn't match DB role, use DB role (shouldn't happen, but safety)
    if (activeRole !== role && activeRole !== "BUYER" && activeRole !== "SELLER") {
      activeRole = role;
    }

    const safeUser = formatUser({
      id: dbUser.id,
      email: dbUser.email,
      role,
      activeRole,
      roles: userRoles,
      categoriesServed: dbUser.categoriesServed,
      companyName: dbUser.companyName,
      fullName: dbUser.fullName,
    });

    // Return authenticated user
    return successResponse<AuthUser>(
      {
        user: safeUser,
        diagnostics: process.env.NODE_ENV !== "production"
          ? {
              hasCookie: true,
              verifyOk: true,
            }
          : undefined,
      },
      200
    );
  } catch (error: any) {
    console.error("[AUTH_ME_ERROR]", {
      error: error?.message || String(error),
    });

    return errorResponse("internal_error", "An unexpected error occurred", 500);
  }
}

/**
 * Logout handler
 * 
 * CRITICAL: Clears auth cookies on all paths (/, /buyer, /seller) to ensure
 * complete logout regardless of where the cookie was originally set.
 * 
 * Uses response.cookies to clear cookies on all paths - this is the correct
 * way to set cookies in Next.js route handlers.
 */
export async function logoutHandler(_request: NextRequest): Promise<NextResponse<AuthSuccessResponse<null>>> {
  const response = successResponse<null>({ user: null }, 200);
  const cookieName = getAuthCookieName();
  const isProd = process.env.NODE_ENV === "production";

  // Clear auth cookies on all relevant paths
  // CRITICAL: Must clear on /, /buyer, AND /seller because cookies set on one path
  // don't clear cookies set on another path
  // Use manual Set-Cookie headers because response.cookies.set() overwrites
  // cookies with the same name (last write wins), preventing multiple Path values
  for (const path of ["/", "/buyer", "/seller"]) {
    // Clear agora.auth cookie
    response.headers.append(
      "Set-Cookie",
      serialize(cookieName, "", {
        path,
        expires: new Date(0),
        httpOnly: true,
        sameSite: "lax",
        secure: isProd,
      })
    );

    // Clear dev_login_token cookie
    response.headers.append(
      "Set-Cookie",
      serialize("dev_login_token", "", {
        path,
        expires: new Date(0),
        sameSite: "lax",
        secure: isProd,
      })
    );
  }

  return response;
}
