import "server-only";
import { getPrisma } from "@/lib/db.server";
import type { BuyerProfile, Supplier } from "./types";
import type { CategoryId } from "@/lib/categoryIds";
import { categoryIdToLabel, labelToCategoryId } from "@/lib/categoryIds";
import type { Category } from "./types";

/**
 * Get buyer profile from database
 */
export async function getBuyerProfileFromDb(userId: string): Promise<BuyerProfile> {
  const prisma = getPrisma();
  
  // Get user
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true },
  });
  
  if (!user || user.role !== "BUYER") {
    throw new Error(`User ${userId} is not a buyer`);
  }
  
  // Get preferred supplier rules
  const rules = await prisma.preferredSupplierRule.findMany({
    where: { buyerId: userId, enabled: true },
    select: {
      categoryId: true,
      category: true,
      sellerIds: true,
    },
  });
  
  // Build preferredSuppliersByCategory map
  const preferredSuppliersByCategory: Record<CategoryId, string[]> = {} as Record<CategoryId, string[]>;
  const defaultStrategyByCategory: Record<CategoryId, "best_price" | "fastest" | "preferred"> = {} as Record<CategoryId, "best_price" | "fastest" | "preferred">;
  
  for (const rule of rules) {
    // Use categoryId if available, otherwise try to normalize category
    let categoryId: CategoryId | null = null;
    
    if (rule.categoryId) {
      // Validate it's a valid CategoryId
      if (rule.categoryId in categoryIdToLabel) {
        categoryId = rule.categoryId as CategoryId;
      }
    } else if (rule.category) {
      // Try to convert legacy category label to categoryId
      const resolvedId = labelToCategoryId[rule.category as keyof typeof labelToCategoryId];
      if (resolvedId && resolvedId in categoryIdToLabel) {
        categoryId = resolvedId as CategoryId;
      }
    }
    
    if (categoryId) {
      // Parse sellerIds JSON
      let sellerIds: string[] = [];
      try {
        const parsed = rule.sellerIds ? JSON.parse(rule.sellerIds) : [];
        if (Array.isArray(parsed)) {
          sellerIds = parsed.filter((id): id is string => typeof id === "string");
        }
      } catch {
        sellerIds = [];
      }
      
      preferredSuppliersByCategory[categoryId] = sellerIds;
      // Default strategy is "preferred" if preferred suppliers are configured
      defaultStrategyByCategory[categoryId] = sellerIds.length > 0 ? "preferred" : "best_price";
    }
  }
  
  return {
    id: userId,
    preferredSuppliersByCategory,
    excludedSuppliers: [], // TODO: Add excluded suppliers to User model or separate table
    defaultStrategyByCategory,
  };
}

/**
 * Get supplier index from database
 * ORG-SCOPED: Builds index from Supplier organizations, not SELLER users
 * Architecture: Supplier → SupplierCategoryLink → SupplierMember → User
 */
export async function getSupplierIndexFromDb(): Promise<Supplier[]> {
  const prisma = getPrisma();
  
  // Query Supplier organizations with their category links and active members
  const suppliers = await prisma.supplier.findMany({
    include: {
      categoryLinks: {
        select: { categoryId: true },
      },
      members: {
        where: { status: "ACTIVE" },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              categoriesServed: true, // For legacy fallback
            },
          },
        },
      },
    },
  });
  
  if (suppliers.length === 0) {
    throw new Error("Supplier index not available: no Supplier organizations found in database. Implement Supplier model/seed or ensure suppliers exist.");
  }
  
  // Convert to Supplier[] format
  const supplierIndex: Supplier[] = [];
  
  for (const supplier of suppliers) {
    // Get categories from SupplierCategoryLink (canonical source)
    let categoryIds: string[] = supplier.categoryLinks.map((link) => link.categoryId);
    let categories: Category[] = [];
    
    // Legacy fallback: if no category links exist, try parsing User.categoriesServed
    // This maintains backwards compatibility for suppliers that haven't been migrated yet
    if (categoryIds.length === 0 && supplier.members.length > 0) {
      // Try to get categories from the first active member's categoriesServed
      const firstMember = supplier.members[0];
      if (firstMember.user.categoriesServed) {
        try {
          const parsed = JSON.parse(firstMember.user.categoriesServed);
          if (Array.isArray(parsed)) {
            for (const item of parsed) {
              if (typeof item === "string") {
                // Try to resolve as categoryId first
                if (item in categoryIdToLabel) {
                  categoryIds.push(item);
                  const label = categoryIdToLabel[item as CategoryId];
                  if (label && !categories.includes(label as Category)) {
                    categories.push(label as Category);
                  }
                } else {
                  // Try as label
                  const resolvedId = labelToCategoryId[item as keyof typeof labelToCategoryId];
                  if (resolvedId && resolvedId in categoryIdToLabel) {
                    categoryIds.push(resolvedId);
                    if (!categories.includes(item as Category)) {
                      categories.push(item as Category);
                    }
                  }
                }
              }
            }
          }
        } catch {
          // Invalid JSON, skip
        }
      }
    } else {
      // Convert categoryIds to labels using categoryIdToLabel
      const seenLabels = new Set<string>();
      for (const categoryId of categoryIds) {
        if (categoryId in categoryIdToLabel) {
          const label = categoryIdToLabel[categoryId as CategoryId];
          if (label && !seenLabels.has(label)) {
            categories.push(label as Category);
            seenLabels.add(label);
          }
        }
      }
    }
    
    // Choose a representative email from one ACTIVE member
    // Prefer the first member with an email
    let representativeEmail: string | null = null;
    for (const member of supplier.members) {
      if (member.user.email) {
        representativeEmail = member.user.email;
        break;
      }
    }
    
    // Only include suppliers that have at least one active member with an email
    // and at least one category (either from SupplierCategoryLink or legacy fallback)
    if (representativeEmail && categoryIds.length > 0) {
      supplierIndex.push({
        id: supplier.id, // Use supplier.id as the supplier identifier (org-scoped)
        name: supplier.name || undefined,
        email: representativeEmail,
        categories,
        categoryIds,
        isActive: true, // TODO: Add isActive field to Supplier model or derive from status
        isVerified: true, // TODO: Add isVerified field to Supplier model
        serviceAreas: [],
        supportsDelivery: true, // TODO: Add to Supplier model
        supportsPickup: true, // TODO: Add to Supplier model
        slaMinutes: null,
        capacityPaused: false, // TODO: Add to Supplier model
      });
    }
  }
  
  return supplierIndex;
}


