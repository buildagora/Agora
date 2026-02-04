import { NextResponse } from "next/server";
import { getEmailConfig } from "@/lib/email.server";

export const runtime = "nodejs";

/**
 * Health check endpoint for email configuration
 * Returns diagnostic info without leaking secrets
 */
export async function GET() {
  const config = getEmailConfig();
  return NextResponse.json(config);
}

