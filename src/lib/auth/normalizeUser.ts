/**
 * Normalize user data from auth responses
 * Handles both legacy (role) and new (activeRole/roles) formats
 */

import type { UserRole } from "./types";

export interface NormalizedUser {
  id: string;
  email: string;
  role: UserRole;
  activeRole: UserRole;
  roles: UserRole[];
  categoriesServed?: string[];
  companyName?: string;
  fullName?: string;
  phone?: string;
  createdAt?: string;
  serviceArea?: string;
}

/**
 * Normalize user data from any auth response format
 * Ensures both `role` and `activeRole` are present
 */
export function normalizeAuthUser(u: any): NormalizedUser | null {
  if (!u || typeof u !== "object") {
    return null;
  }

  // Extract required fields
  const id = u.id;
  const email = u.email;

  if (!id || !email) {
    return null;
  }

  // Determine activeRole: prefer activeRole, fallback to role, then roles[0]
  let activeRole: UserRole | null = null;
  if (u.activeRole === "BUYER" || u.activeRole === "SELLER") {
    activeRole = u.activeRole;
  } else if (u.role === "BUYER" || u.role === "SELLER") {
    activeRole = u.role;
  } else if (Array.isArray(u.roles) && u.roles.length > 0) {
    const firstRole = u.roles[0];
    if (firstRole === "BUYER" || firstRole === "SELLER") {
      activeRole = firstRole;
    }
  }

  if (!activeRole) {
    return null; // Cannot normalize without a valid role
  }

  // Determine roles array
  let roles: UserRole[] = [];
  if (Array.isArray(u.roles)) {
    roles = u.roles.filter((r: any) => r === "BUYER" || r === "SELLER");
  }
  if (roles.length === 0) {
    roles = [activeRole]; // Default to single role
  }

  // Return normalized user with both role (alias) and activeRole
  return {
    id,
    email,
    role: activeRole, // Alias for backward compatibility
    activeRole,
    roles,
    categoriesServed: Array.isArray(u.categoriesServed) ? u.categoriesServed : undefined,
    companyName: u.companyName,
    fullName: u.fullName,
    phone: u.phone,
    createdAt: u.createdAt,
    serviceArea: u.serviceArea,
  };
}



