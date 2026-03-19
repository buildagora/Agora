import { track } from "@vercel/analytics";
import type { AnalyticsEventName } from "@/lib/analytics/events";

export type AnalyticsProps = Record<string, string | number | boolean | null>;

export function trackEvent(name: AnalyticsEventName, props?: AnalyticsProps): void {
  track(name, props);
}

