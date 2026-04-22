import "server-only";

import { getPrisma } from "@/lib/db.server";

export type StoreAnalyticsEventInput = {
  name: string;
  visitorId: string;
  sessionId: string;
  source?: string | null;
  medium?: string | null;
  campaign?: string | null;
  path?: string | null;
  properties?: Record<string, unknown> | null;
  country?: string | null;
  region?: string | null;
  city?: string | null;
};

/**
 * Persists one analytics row to the AnalyticsEvent table (first-party store).
 */
export async function storeAnalyticsEvent(input: StoreAnalyticsEventInput): Promise<void> {
  const prisma = getPrisma();

  let propertiesJson: string | null = null;
  if (input.properties !== undefined && input.properties !== null) {
    propertiesJson = JSON.stringify(input.properties);
  }

  await prisma.analyticsEvent.create({
    data: {
      name: input.name.trim(),
      visitorId: input.visitorId.trim(),
      sessionId: input.sessionId.trim(),
      source: input.source ?? null,
      medium: input.medium ?? null,
      campaign: input.campaign ?? null,
      path: input.path ?? null,
      properties: propertiesJson,
      country: input.country ?? null,
      region: input.region ?? null,
      city: input.city ?? null,
    },
  });
}
