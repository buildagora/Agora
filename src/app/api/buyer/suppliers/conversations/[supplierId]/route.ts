import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/db.server";
import { jsonError, withErrorHandling } from "@/lib/apiResponse";
import { verifyAuthToken, getAuthCookieName } from "@/lib/jwt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function getBuyerFromRequest(request: NextRequest) {
  // Read auth cookie
  const cookieName = getAuthCookieName();
  const token = request.cookies.get(cookieName)?.value;

  if (!token) {
    return null;
  }

  // Verify JWT token
  const payload = await verifyAuthToken(token);
  if (!payload) {
    return null;
  }

  // Load user from database
  const prisma = getPrisma();
  const dbUser = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { id: true, role: true, fullName: true, companyName: true },
  });

  if (!dbUser || dbUser.role !== "BUYER") {
    return null;
  }

  return dbUser;
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ supplierId: string }> }
) {
  return withErrorHandling(async () => {
    const dbUser = await getBuyerFromRequest(request);
    if (!dbUser) {
      return jsonError("UNAUTHORIZED", "Authentication required", 401);
    }

    const { supplierId } = await context.params;

    const prisma = getPrisma();

    // Find or create general conversation (no RFQ scope)
    // Use findFirst because findUnique doesn't support null in compound unique constraints
    let conversation = await prisma.supplierConversation.findFirst({
      where: {
        buyerId: dbUser.id,
        supplierId: supplierId,
        rfqId: null, // General conversation, not tied to a specific RFQ
      },
      include: {
        messages: {
          where: {
            deletedForBuyerAt: null,
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!conversation) {
      // Create new general conversation (no RFQ scope)
      conversation = await prisma.supplierConversation.create({
        data: {
          buyerId: dbUser.id,
          supplierId: supplierId,
          rfqId: null, // General conversation, not tied to a specific RFQ
        },
        include: {
          messages: {
            orderBy: { createdAt: "asc" },
          },
        },
      });
    }

    const formattedMessages = conversation.messages.map((msg) => ({
      id: msg.id,
      senderType: msg.senderType,
      senderDisplayName: msg.senderDisplayName,
      body: msg.body,
      createdAt: msg.createdAt.toISOString(),
    }));

    return NextResponse.json({
      ok: true,
      conversationId: conversation.id,
      messages: formattedMessages,
    });
  });
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ supplierId: string }> }
) {
  return withErrorHandling(async () => {
    const dbUser = await getBuyerFromRequest(request);
    if (!dbUser) {
      return jsonError("UNAUTHORIZED", "Authentication required", 401);
    }

    const { supplierId } = await context.params;

    const prisma = getPrisma();

    // Find or create conversation
    let conversation = await prisma.supplierConversation.findFirst({
      where: {
        buyerId: dbUser.id,
        supplierId: supplierId,
      },
      include: {
        messages: {
          where: {
            deletedForBuyerAt: null,
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!conversation) {
      conversation = await prisma.supplierConversation.create({
        data: {
          buyerId: dbUser.id,
          supplierId: supplierId,
        },
        include: {
          messages: {
            orderBy: { createdAt: "asc" },
          },
        },
      });
    }

    const formattedMessages = conversation.messages.map((msg) => ({
      id: msg.id,
      senderType: msg.senderType,
      senderDisplayName: msg.senderDisplayName,
      body: msg.body,
      createdAt: msg.createdAt.toISOString(),
    }));

    return NextResponse.json({
      ok: true,
      conversationId: conversation.id,
      messages: formattedMessages,
    });
  });
}

