/**
 * Simulate a Twilio inbound-SMS webhook against the local dev server.
 *
 * Usage:
 *   npx tsx scripts/sim-inbound-sms.ts --from "+15555551234" --body "yes please"
 *   npx tsx scripts/sim-inbound-sms.ts --from "555-555-1234" --body "what's the price?" --url http://127.0.0.1:3000/api/sms/inbound
 *
 * If TWILIO_AUTH_TOKEN is set, we compute a real X-Twilio-Signature so the
 * server's signature check passes. If unset (dev mode), the server skips
 * validation, so we send no signature header.
 */

import "dotenv/config";
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

import twilio from "twilio";

type Args = {
  from: string;
  body: string;
  url: string;
};

function parseArgs(): Args {
  const out: Partial<Args> = {
    url: "http://127.0.0.1:3000/api/sms/inbound",
  };
  for (let i = 2; i < process.argv.length; i++) {
    const k = process.argv[i];
    const v = process.argv[i + 1];
    if (k === "--from") out.from = v;
    else if (k === "--body") out.body = v;
    else if (k === "--url") out.url = v;
    else continue;
    i++;
  }
  if (!out.from || !out.body) {
    console.error(
      'Usage: tsx scripts/sim-inbound-sms.ts --from "+15555551234" --body "..." [--url http://...]'
    );
    process.exit(1);
  }
  return out as Args;
}

function buildBody(params: Record<string, string>): string {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) usp.append(k, v);
  return usp.toString();
}

async function main() {
  const args = parseArgs();
  const params: Record<string, string> = {
    From: args.from,
    To: process.env.TWILIO_FROM_NUMBER || "+15550000000",
    Body: args.body,
    MessageSid: `SM${Date.now()}`,
    AccountSid: process.env.TWILIO_ACCOUNT_SID || "ACdev",
    NumMedia: "0",
  };

  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
  };

  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (authToken) {
    const sig = twilio.getExpectedTwilioSignature(authToken, args.url, params);
    headers["X-Twilio-Signature"] = sig;
    console.log(`[sim] signed request with TWILIO_AUTH_TOKEN`);
  } else {
    console.log(
      `[sim] no TWILIO_AUTH_TOKEN — sending unsigned (dev mode bypasses validation)`
    );
  }

  const res = await fetch(args.url, {
    method: "POST",
    headers,
    body: buildBody(params),
  });
  const text = await res.text();
  console.log(`HTTP ${res.status}`);
  console.log(text);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
