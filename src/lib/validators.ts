"use client";

/**
 * Check if we're in production environment
 */
export function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

/**
 * Validate email or test ID
 * In production: requires valid email format
 * In development: allows any non-empty identifier (min 3 chars, no spaces)
 * 
 * @param value The input value to validate
 * @returns Validation result with normalized value
 */
export function validateEmailOrTestId(value: string): {
  ok: boolean;
  normalized: string;
  message?: string;
} {
  const trimmed = value.trim();
  const normalized = trimmed.toLowerCase();

  // Empty check
  if (!trimmed) {
    return {
      ok: false,
      normalized: "",
      message: isProduction() ? "Enter a valid email address" : "Enter an email or test ID",
    };
  }

  if (isProduction()) {
    // Production: strict email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmed)) {
      return {
        ok: false,
        normalized: normalized,
        message: "Enter a valid email address",
      };
    }
    return {
      ok: true,
      normalized: normalized,
    };
  } else {
    // Development: allow any identifier (min 3 chars, no spaces)
    if (trimmed.length < 3) {
      return {
        ok: false,
        normalized: normalized,
        message: "Enter an email or test ID (at least 3 characters)",
      };
    }
    if (trimmed.includes(" ")) {
      return {
        ok: false,
        normalized: normalized,
        message: "Email or test ID cannot contain spaces",
      };
    }
    return {
      ok: true,
      normalized: normalized,
    };
  }
}

/**
 * Get email input label based on environment
 */
export function getEmailLabel(): string {
  return isProduction() ? "Email address" : "Email (or test ID)";
}

/**
 * Get email input placeholder based on environment
 */
export function getEmailPlaceholder(): string {
  return isProduction()
    ? "Email address"
    : "e.g., buyer1 / seller1 / test@example.com";
}

