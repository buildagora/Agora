import { track } from "@vercel/analytics";
import type { AnalyticsEventName } from "@/lib/analytics/events";
import { getAnalyticsContext } from "./context";

export type AnalyticsProps = Record<string, string | number | boolean | null>;

const ANALYTICS_EVENTS_URL = "/api/analytics/events";

function sendFirstPartyAnalyticsEvent(payload: {
  name: string;
  visitorId: string;
  sessionId: string;
  source: string | null;
  medium: string | null;
  campaign: string | null;
  path: string;
  properties: AnalyticsProps | null;
}): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const body = JSON.stringify(payload);

    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      const blob = new Blob([body], { type: "application/json" });
      if (navigator.sendBeacon(ANALYTICS_EVENTS_URL, blob)) {
        return;
      }
    }

    void fetch(ANALYTICS_EVENTS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    });
  } catch {
    // fail silently
  }
}

export function trackEvent(name: AnalyticsEventName, props?: AnalyticsProps): void {
  const context = getAnalyticsContext();
  const mergedProps = {
    ...context,
    ...props,
  };

  track(name, mergedProps);

  sendFirstPartyAnalyticsEvent({
    name,
    visitorId: context.visitorId,
    sessionId: context.sessionId,
    source: context.source,
    medium: context.medium,
    campaign: context.campaign,
    path: context.path,
    properties: props ?? null,
  });
}

