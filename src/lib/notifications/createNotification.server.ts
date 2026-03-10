import { getPrisma } from "@/lib/db.server";

export async function createNotification(args: {
  userId: string;
  type: string;
  title?: string;
  body?: string | null;
  rfqId?: string | null;
  bidId?: string | null;
  idempotencyKey?: string | null;
  data?: unknown;
}) {
  const prisma = getPrisma();

  // Derive title from args.title, args.data.title, or fallback to args.type
  const derivedTitle =
    args.title ??
    (typeof args.data === "object" && args.data && "title" in args.data && typeof (args.data as any).title === "string"
      ? (args.data as any).title
      : args.type);

  // Use args.data if provided, otherwise build data object from title, body, bidId, idempotencyKey
  // The Prisma Notification model has: id, userId, rfqId, type, createdAt, readAt, data (String? - JSON)
  let notificationData: string | null = null;
  
  if (args.data !== undefined) {
    // If args.data is provided, ensure it has a title
    const dataObj = typeof args.data === "object" && args.data !== null ? { ...(args.data as any) } : {};
    if (!("title" in dataObj)) {
      dataObj.title = derivedTitle;
    }
    notificationData = JSON.stringify(dataObj);
  } else {
    // Build data object from individual fields
    const data: any = {
      title: derivedTitle,
    };
    if (args.body) data.body = args.body;
    if (args.bidId) data.bidId = args.bidId;
    if (args.idempotencyKey) data.idempotencyKey = args.idempotencyKey;
    notificationData = JSON.stringify(data);
  }

  const created = await prisma.notification.create({
    data: {
      userId: args.userId,
      type: args.type,
      rfqId: args.rfqId ?? null,
      data: notificationData,
    },
    select: { id: true },
  });

  return created.id;
}

