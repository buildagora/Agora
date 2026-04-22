import { track } from "@vercel/analytics/server";
import type { AnalyticsEventName } from "@/lib/analytics/events";
import { storeAnalyticsEvent } from "@/lib/analytics/ingest.server";

export type AnalyticsProps = Record<string, string | number | boolean | null>;

export async function trackServerEvent(
  name: AnalyticsEventName,
  props?: AnalyticsProps
): Promise<void> {
  try {
    await track(name, props);
  } catch (error) {
    console.error("[ANALYTICS_VERCEL_TRACK_FAILED]", {
      name,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  try {
    await storeAnalyticsEvent({
      name,
      visitorId: `server:${name}`,
      sessionId: `server:${Date.now()}`,
      source: "server",
      medium: null,
      campaign: null,
      path: null,
      properties: props ?? null,
      country: null,
      region: null,
      city: null,
    });
  } catch (error) {
    console.error("[ANALYTICS_DB_STORE_FAILED]", {
      name,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

