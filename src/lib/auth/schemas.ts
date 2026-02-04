/**
 * Canonical auth schemas and validation
 * Single source of truth for auth input validation
 */

import "server-only";
import { z } from "zod";

/**
 * Normalize email: trim whitespace and convert to lowercase
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Sign-up input schema
 * TASK 2: Role is REQUIRED and STRICTLY one of "BUYER" or "SELLER"
 */
export const SignUpInputSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  role: z.enum(["BUYER", "SELLER"], {
    required_error: "Role is required",
    invalid_type_error: "Role must be BUYER or SELLER",
    errorMap: () => ({ message: "Role must be BUYER or SELLER" }),
  }),
  // Optional fields that may be provided during signup
  fullName: z.string().optional(),
  companyName: z.string().optional(),
  phone: z.string().optional(),
  categoriesServed: z.array(z.string()).optional(),
  serviceArea: z.string().optional(),
});

export type SignUpInput = z.infer<typeof SignUpInputSchema>;

/**
 * Login input schema
 */
export const LoginInputSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

export type LoginInput = z.infer<typeof LoginInputSchema>;

/**
 * Validate and normalize sign-up input
 */
export function validateSignUpInput(body: unknown): { success: true; data: SignUpInput } | { success: false; error: string } {
  const result = SignUpInputSchema.safeParse(body);
  if (!result.success) {
    const firstError = result.error.errors[0];
    return { success: false, error: firstError?.message || "Invalid sign-up data" };
  }
  return { success: true, data: result.data };
}

/**
 * Validate and normalize login input
 */
export function validateLoginInput(body: unknown): { success: true; data: LoginInput } | { success: false; error: string } {
  const result = LoginInputSchema.safeParse(body);
  if (!result.success) {
    const firstError = result.error.errors[0];
    return { success: false, error: firstError?.message || "Invalid login data" };
  }
  return { success: true, data: result.data };
}



