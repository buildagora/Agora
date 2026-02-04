/**
 * Standardized JSON API response helpers
 * Ensures all API routes return consistent JSON error envelopes
 */

import { NextResponse } from "next/server";

export interface ApiError {
  ok: false;
  error: string;
  message?: string;
  details?: unknown;
}

export interface ApiSuccess<T = unknown> {
  ok: true;
  data?: T;
}

export type ApiResponse<T = unknown> = ApiSuccess<T> | ApiError;

/**
 * Return a successful JSON response
 */
export function jsonOk<T>(data: T, status: number = 200): NextResponse<ApiSuccess<T>> {
  return NextResponse.json({ ok: true, data }, { status });
}

/**
 * Return an error JSON response
 */
export function jsonError(
  code: string,
  message: string,
  status: number = 400,
  details?: unknown
): NextResponse<ApiError> {
  return NextResponse.json(
    {
      ok: false,
      error: code,
      message,
      ...(details !== undefined && { details }),
    },
    { status }
  );
}

/**
 * Wrap an async handler to catch errors and return JSON errors
 */
export function withErrorHandling(
  handler: () => Promise<NextResponse<ApiSuccess | ApiError>>
): Promise<NextResponse<ApiSuccess | ApiError>> {
  return handler().catch((error) => {
    console.error("API_ERROR", error);
    
    const isDev = process.env.NODE_ENV !== "production";
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    if (error instanceof Error && error.message.startsWith("ENV_MISCONFIGURED")) {
      return jsonError("ENV_MISCONFIGURED", error.message, 500);
    }
    
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return jsonError("UNAUTHORIZED", "Authentication required", 401);
    }
    
    // Distinguish Prisma validation errors (400) from connection errors (500)
    const isPrismaError = error instanceof Error && (
      error.message.includes("prisma") || 
      error.message.includes("database") || 
      error.message.includes("Prisma") ||
      error.constructor.name === "PrismaClientKnownRequestError" ||
      error.constructor.name === "PrismaClientValidationError"
    );
    
    const isValidationError = error instanceof Error && (
      error.message.includes("Unique constraint") ||
      error.message.includes("Foreign key constraint") ||
      error.message.includes("Record to update not found") ||
      error.message.includes("Record to delete does not exist") ||
      error.message.includes("Invalid value") ||
      error.constructor.name === "PrismaClientValidationError" ||
      (error.constructor.name === "PrismaClientKnownRequestError" && 
       (error as any).code && ["P2002", "P2003", "P2025"].includes((error as any).code))
    );
    
    const isConnectionError = error instanceof Error && (
      error.message.includes("Can't reach database") ||
      error.message.includes("Connection") ||
      error.message.includes("ECONNREFUSED") ||
      error.message.includes("ETIMEDOUT") ||
      (error.constructor.name === "PrismaClientKnownRequestError" && 
       (error as any).code && ["P1001", "P1002", "P1008"].includes((error as any).code))
    );
    
    if (isPrismaError) {
      // Extract Prisma error code and meta for better diagnostics
      const prismaCode = (error as any)?.code || null;
      const prismaMeta = (error as any)?.meta || null;
      
      // Prisma validation errors → 400 with real message in dev
      if (isValidationError) {
        const devMessage = isDev 
          ? `${errorMessage}${prismaCode ? ` (Prisma ${prismaCode})` : ""}${prismaMeta ? ` - ${JSON.stringify(prismaMeta)}` : ""}`
          : "Invalid request data";
        return jsonError(
          "VALIDATION_ERROR",
          devMessage,
          400,
          isDev ? { prismaCode, prismaMeta, originalError: errorMessage } : undefined
        );
      }
      
      // Actual DB connection errors → 500
      if (isConnectionError) {
        const devMessage = isDev
          ? `${errorMessage}${prismaCode ? ` (Prisma ${prismaCode})` : ""}`
          : "Database connection error. Please try again.";
        return jsonError(
          "DATABASE_CONNECTION_ERROR",
          devMessage,
          500,
          isDev ? { prismaCode, prismaMeta } : undefined
        );
      }
      
      // Other Prisma errors → 500 with detailed info in dev
      const devMessage = isDev
        ? `${errorMessage}${prismaCode ? ` (Prisma ${prismaCode})` : ""}${prismaMeta ? ` - ${JSON.stringify(prismaMeta)}` : ""}`
        : "Database error. Please try again.";
      return jsonError(
        "DATABASE_ERROR",
        devMessage,
        500,
        isDev ? { prismaCode, prismaMeta, originalError: errorMessage } : undefined
      );
    }
    
    // In development: return real error message
    // In production: mask with generic message
    return jsonError(
      "INTERNAL_ERROR",
      isDev ? errorMessage : "Internal server error",
      500
    );
  });
}

