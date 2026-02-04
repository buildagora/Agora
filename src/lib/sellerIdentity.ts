/**
 * Seller Identity Resolution
 * Resolves supplier ID from current user (matches user email to supplier email)
 */

// Removed storage dependency - seller identity will be resolved via API/DB
// This module is not imported by runtime surface and can be deleted if unused

/**
 * Get the current supplier ID by matching user email to supplier email
 * @returns Supplier ID if found, null otherwise
 * @deprecated This function used storage and is no longer functional. Use API/DB instead.
 */
export function getCurrentSupplierId(): string | null {
  // TODO: Replace with API call to /api/sellers/me or use user.id directly
  // For now, return null (supplier identity should come from DB, not storage)
  return null;
}



