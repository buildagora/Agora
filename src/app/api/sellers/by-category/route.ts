import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/db.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const categoryId = url.searchParams.get("categoryId") || url.searchParams.get("category");

    if (!categoryId) {
      return NextResponse.json(
        {
          ok: false,
          error: "BAD_REQUEST",
          message: "categoryId is required",
        },
        { status: 400 }
      );
    }

    const prisma = getPrisma();

    // Query all SELLER users with non-null categoriesServed
    const sellers = await prisma.user.findMany({
      where: {
        role: "SELLER",
        categoriesServed: {
          not: null,
        },
      },
      select: {
        id: true,
        email: true,
        companyName: true,
        fullName: true,
        categoriesServed: true,
      },
    });

    // Filter sellers whose categoriesServed array contains the requested categoryId (case-insensitive)
    const normalizedCategoryId = categoryId.toLowerCase().trim();
    const matchingSellers = sellers
      .map((seller) => {
        if (!seller.categoriesServed) return null;

        // Parse categoriesServed JSON string
        let parsedCategories: string[] = [];
        try {
          parsedCategories = JSON.parse(seller.categoriesServed);
        } catch {
          // If parsing fails, skip this seller
          return null;
        }

        // Check if parsed array contains the requested categoryId (case-insensitive)
        const hasCategory = parsedCategories.some(
          (cat) => cat.toLowerCase().trim() === normalizedCategoryId
        );

        if (!hasCategory) return null;

        // Build seller object with displayName
        const displayName =
          seller.companyName?.trim() ||
          seller.fullName?.trim() ||
          seller.email ||
          "Unknown";

        return {
          id: seller.id,
          companyName: seller.companyName,
          displayName,
          email: seller.email,
          categoriesServed: parsedCategories,
        };
      })
      .filter((seller): seller is NonNullable<typeof seller> => seller !== null);

    // DEV-ONLY: Log query results
    if (process.env.NODE_ENV === "development") {
      console.log("[SELLERS_BY_CATEGORY]", {
        categoryId,
        count: matchingSellers.length,
      });
    }

    // Return array format (page supports both array and { ok: true, data: [...] })
    return NextResponse.json(matchingSellers, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[SELLERS_BY_CATEGORY_ERROR]", error);
    return NextResponse.json(
      {
        ok: false,
        error: "INTERNAL_ERROR",
        message: "Failed to fetch sellers",
      },
      { status: 500 }
    );
  }
}

