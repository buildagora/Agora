/**
 * Phone normalization + SMS body shaping.
 *
 * Safe to import from server or client (no Node-only deps).
 */

const E164_US_RE = /^\+1\d{10}$/;

/**
 * Normalize a US phone input to E.164 (`+1XXXXXXXXXX`).
 *
 * Accepts: "5555551234", "555-555-1234", "(555) 555-1234", "+15555551234".
 * Returns null if the digit count doesn't fit a US number.
 */
export function normalizeUsPhone(input: string): { e164: string } | null {
  const digits = input.replace(/\D+/g, "");
  let e164: string;
  if (digits.length === 10) {
    e164 = `+1${digits}`;
  } else if (digits.length === 11 && digits.startsWith("1")) {
    e164 = `+${digits}`;
  } else {
    return null;
  }
  return E164_US_RE.test(e164) ? { e164 } : null;
}

/**
 * Build the SMS body delivered to the buyer when a supplier replies.
 *
 * Hard-cap at ~250 chars so we stay within a single SMS segment after the
 * "[Agora] {Name}: " prefix and the STOP suffix. We trim the body, not the
 * supplier name (the buyer needs to know who's replying).
 */
export function formatBuyerSms(args: {
  supplierName: string;
  body: string;
}): string {
  const trimmedBody = args.body.trim();
  const truncated =
    trimmedBody.length > 130 ? `${trimmedBody.slice(0, 127)}...` : trimmedBody;
  return `[Agora] ${args.supplierName}: ${truncated}\n\nReply STOP to opt out.`;
}
