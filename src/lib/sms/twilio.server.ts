/**
 * Server-only Twilio SMS sender.
 *
 * In dev (no `TWILIO_ACCOUNT_SID` set) we log the payload to console and
 * return success — keeps the rest of the app working without a real account.
 * Set all three env vars to actually send: TWILIO_ACCOUNT_SID,
 * TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER.
 */

import "server-only";

type TwilioModule = typeof import("twilio");
type TwilioClient = ReturnType<TwilioModule>;

const globalForTwilio = globalThis as unknown as {
  __agoraTwilio?: TwilioClient | null;
};

function isConfigured(): boolean {
  return !!process.env.TWILIO_ACCOUNT_SID && !!process.env.TWILIO_AUTH_TOKEN;
}

async function getSmsClient(): Promise<TwilioClient | null> {
  if (globalForTwilio.__agoraTwilio !== undefined) {
    return globalForTwilio.__agoraTwilio;
  }
  if (!isConfigured()) {
    globalForTwilio.__agoraTwilio = null;
    return null;
  }
  const twilio = (await import("twilio")).default as TwilioModule;
  const client = twilio(
    process.env.TWILIO_ACCOUNT_SID!,
    process.env.TWILIO_AUTH_TOKEN!
  );
  globalForTwilio.__agoraTwilio = client;
  return client;
}

export type SendSmsResult =
  | { ok: true; sid: string | null }
  | { ok: false; error: string };

export async function sendSms(args: {
  to: string; // E.164
  body: string;
}): Promise<SendSmsResult> {
  const from = process.env.TWILIO_FROM_NUMBER;
  const client = await getSmsClient();

  if (!client || !from) {
    console.log(
      `[sms_dev_log] to=${args.to} from=${from ?? "<unset>"}\n  body: ${args.body}`
    );
    return { ok: true, sid: null };
  }

  try {
    const msg = await client.messages.create({
      to: args.to,
      from,
      body: args.body,
    });
    return { ok: true, sid: msg.sid };
  } catch (err: any) {
    const error = err?.message ?? "Twilio send failed";
    console.error(`[sms_send_failed] to=${args.to} error=${error}`);
    return { ok: false, error };
  }
}

/**
 * Validate a Twilio webhook signature on an inbound request.
 *
 * `params` should be the parsed form fields (NOT JSON-stringified).
 * In dev mode (no TWILIO_AUTH_TOKEN), returns true so local testing works.
 */
export async function validateInboundSignature(args: {
  signatureHeader: string | null;
  fullUrl: string;
  params: Record<string, string>;
}): Promise<boolean> {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken) {
    console.warn(
      "[twilio_signature] TWILIO_AUTH_TOKEN unset — accepting inbound without validation (dev mode only!)"
    );
    return true;
  }
  if (!args.signatureHeader) return false;
  const twilio = (await import("twilio")).default as TwilioModule;
  return twilio.validateRequest(
    authToken,
    args.signatureHeader,
    args.fullUrl,
    args.params
  );
}
