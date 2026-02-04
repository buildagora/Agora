/**
 * Seller Display Name Helper
 * Canonical function for computing seller display names with stable fallbacks
 * NEVER returns email in production unless explicitly enabled via debug flag
 */

export interface SellerDisplayNameInput {
  user: {
    id: string;
    email: string;
    fullName?: string | null;
    companyName?: string | null;
  };
  // Optional: If you have a separate sellerProfile model in the future
  sellerProfile?: {
    companyName?: string | null;
    displayName?: string | null;
    legalName?: string | null;
    firstName?: string | null;
    lastName?: string | null;
  } | null;
}

/**
 * Get seller display name with stable fallback order
 * 
 * Fallback order:
 * 1. sellerProfile.companyName (preferred)
 * 2. sellerProfile.displayName
 * 3. sellerProfile.legalName OR (firstName + lastName)
 * 4. user.companyName
 * 5. user.fullName
 * 6. "Supplier" + last 4 of user id (non-email fallback)
 * 7. user.email (ONLY in development or with debug flag)
 * 
 * @param input Seller user and profile data
 * @param options Optional configuration
 * @returns Display name string (never email in production)
 */
export function getSellerDisplayName(
  input: SellerDisplayNameInput,
  options?: {
    allowEmail?: boolean; // Only allow email fallback if explicitly enabled
    debug?: boolean; // Debug mode (allows email fallback)
  }
): string {
  const { user, sellerProfile } = input;
  const allowEmail = options?.allowEmail || options?.debug || process.env.NODE_ENV === "development";
  
  // 1. sellerProfile.companyName (preferred)
  if (sellerProfile?.companyName?.trim()) {
    return sellerProfile.companyName.trim();
  }
  
  // 2. sellerProfile.displayName
  if (sellerProfile?.displayName?.trim()) {
    return sellerProfile.displayName.trim();
  }
  
  // 3. sellerProfile.legalName OR (firstName + lastName)
  if (sellerProfile?.legalName?.trim()) {
    return sellerProfile.legalName.trim();
  }
  if (sellerProfile?.firstName?.trim() || sellerProfile?.lastName?.trim()) {
    const parts = [sellerProfile.firstName?.trim(), sellerProfile.lastName?.trim()].filter(Boolean);
    if (parts.length > 0) {
      return parts.join(" ");
    }
  }
  
  // 4. user.companyName
  if (user.companyName?.trim()) {
    return user.companyName.trim();
  }
  
  // 5. user.fullName
  if (user.fullName?.trim()) {
    return user.fullName.trim();
  }
  
  // 6. Generic "Supplier" fallback (no random suffixes)
  // This should rarely be hit if seller onboarding enforces companyName
  return "Supplier";
}
