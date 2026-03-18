import "server-only";
import { getPrisma } from "@/lib/db.server";

/**
 * Get supplier membership for a user
 * Returns supplierId, role, and status if user has an ACTIVE membership
 */
export async function getSupplierMembershipForUser(
  userId: string
): Promise<{ supplierId: string; role: "ADMIN" | "MEMBER"; status: "ACTIVE" } | null> {
  const prisma = getPrisma();
  
  const membership = await prisma.supplierMember.findFirst({
    where: {
      userId,
      status: "ACTIVE",
    },
    select: {
      supplierId: true,
      role: true,
      status: true,
    },
  });

  if (!membership) {
    return null;
  }

  return {
    supplierId: membership.supplierId,
    role: membership.role as "ADMIN" | "MEMBER",
    status: membership.status as "ACTIVE",
  };
}



