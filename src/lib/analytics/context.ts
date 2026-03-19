/**
 * Client-side analytics context (visitor, session, UTM, path).
 * Safe to call from browser code only; SSR returns minimal defaults.
 */

export type AnalyticsContext = {
  visitorId: string;
  sessionId: string;
  source: string | null;
  medium: string | null;
  campaign: string | null;
  path: string;
};

const VISITOR_ID_KEY = "agora_visitor_id";
const SESSION_ID_KEY = "agora_session_id";
const ATTRIBUTION_KEY = "agora_attribution";

type StoredAttribution = {
  source: string | null;
  medium: string | null;
  campaign: string | null;
};

function normalizeUtmValue(value: string | null): string | null {
  if (value === null) return null;
  const t = value.trim();
  return t.length > 0 ? t : null;
}

function readUrlUtm(): StoredAttribution {
  const params = new URLSearchParams(window.location.search);
  return {
    source: normalizeUtmValue(params.get("utm_source")),
    medium: normalizeUtmValue(params.get("utm_medium")),
    campaign: normalizeUtmValue(params.get("utm_campaign")),
  };
}

function hasAnyUtm(a: StoredAttribution): boolean {
  return a.source !== null || a.medium !== null || a.campaign !== null;
}

function loadSavedAttribution(): StoredAttribution | null {
  try {
    const raw = window.localStorage.getItem(ATTRIBUTION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return null;
    }
    const o = parsed as Record<string, unknown>;
    return {
      source: typeof o.source === "string" ? normalizeUtmValue(o.source) : null,
      medium: typeof o.medium === "string" ? normalizeUtmValue(o.medium) : null,
      campaign: typeof o.campaign === "string" ? normalizeUtmValue(o.campaign) : null,
    };
  } catch {
    return null;
  }
}

function saveAttribution(a: StoredAttribution): void {
  try {
    window.localStorage.setItem(ATTRIBUTION_KEY, JSON.stringify(a));
  } catch {
    // ignore quota / private mode
  }
}

function generateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

/**
 * When auth is wired in, use this to exclude or segment internal traffic.
 * Not used by getAnalyticsContext() until email is passed from callers.
 */
export function isInternalUserEmail(_email: string | null | undefined): boolean {
  void _email;
  return false;
}

/**
 * Returns analytics context for the current page load.
 * On the server (no window), returns empty strings / nulls.
 */
export function getAnalyticsContext(): AnalyticsContext {
  if (typeof window === "undefined") {
    return {
      visitorId: "",
      sessionId: "",
      source: null,
      medium: null,
      campaign: null,
      path: "",
    };
  }

  let visitorId = "";
  try {
    visitorId = window.localStorage.getItem(VISITOR_ID_KEY) ?? "";
    if (!visitorId) {
      visitorId = generateId();
      window.localStorage.setItem(VISITOR_ID_KEY, visitorId);
    }
  } catch {
    visitorId = generateId();
  }

  let sessionId = "";
  try {
    sessionId = window.sessionStorage.getItem(SESSION_ID_KEY) ?? "";
    if (!sessionId) {
      sessionId = generateId();
      window.sessionStorage.setItem(SESSION_ID_KEY, sessionId);
    }
  } catch {
    sessionId = generateId();
  }

  let source: string | null = null;
  let medium: string | null = null;
  let campaign: string | null = null;
  try {
    const fromUrl = readUrlUtm();
    if (hasAnyUtm(fromUrl)) {
      saveAttribution(fromUrl);
      source = fromUrl.source;
      medium = fromUrl.medium;
      campaign = fromUrl.campaign;
    } else {
      const saved = loadSavedAttribution();
      if (saved) {
        source = saved.source;
        medium = saved.medium;
        campaign = saved.campaign;
      }
    }
  } catch {
    // ignore parse / storage errors
  }

  const path = window.location.pathname ?? "";

  return {
    visitorId,
    sessionId,
    source,
    medium,
    campaign,
    path,
  };
}
