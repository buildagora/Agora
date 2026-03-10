/**
 * Shared auth types (used by both client and server)
 */

export type UserRole = "BUYER" | "SELLER";

export interface User {
  role?: UserRole; // Optional - set during onboarding, IMMUTABLE once set (legacy - use activeRole)
  activeRole: UserRole; // REQUIRED - the currently active role for this session
  id: string;
  companyName: string;
  fullName: string;
  email: string;
  phone?: string;
  createdAt?: string;
  categoriesServed?: string[]; // Only for SELLER role
  serviceArea?: string; // Only for SELLER role
  roles?: UserRole[]; // All roles this user has (for users with multiple roles)
}

export interface Credentials {
  email: string;
  passwordHash: string; // In real app, this would be hashed on server
}


