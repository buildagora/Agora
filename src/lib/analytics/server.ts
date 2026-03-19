import { track } from "@vercel/analytics/server";
import type { AnalyticsEventName } from "@/lib/analytics/events";

export type AnalyticsProps = Record<string, string | number | boolean | null>;

export async function trackServerEvent(
  name: AnalyticsEventName,
  props?: AnalyticsProps
): Promise<void> {
  await track(name, props);
}

