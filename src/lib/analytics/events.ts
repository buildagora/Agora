export const ANALYTICS_EVENTS = {
  landing_viewed: "landing_viewed",
  landing_search_started: "landing_search_started",
  landing_discovery_signup_clicked: "landing_discovery_signup_clicked",
  landing_cta_clicked: "landing_cta_clicked",
  login_clicked: "login_clicked",
  signup_started: "signup_started",
  signup_role_selected: "signup_role_selected",
  signup_submitted: "signup_submitted",
  signup_completed: "signup_completed",
  signup_failed: "signup_failed",
  dashboard_viewed: "dashboard_viewed",
  request_started: "request_started",
  request_step_completed: "request_step_completed",
  request_review_viewed: "request_review_viewed",
  request_submitted: "request_submitted",
  request_submission_failed: "request_submission_failed",
  supplier_dashboard_viewed: "supplier_dashboard_viewed",
  conversation_opened: "conversation_opened",
  message_sent: "message_sent",
  quote_started: "quote_started",
  quote_submitted: "quote_submitted",
} as const;

export type AnalyticsEventName = (typeof ANALYTICS_EVENTS)[keyof typeof ANALYTICS_EVENTS];

