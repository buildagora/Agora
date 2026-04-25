import type { NextConfig } from "next";
import path from "path";
import { fileURLToPath } from "url";

// Get __dirname - Next.js compiles .ts config files to CommonJS where __dirname is available
// We use import.meta.url which works in both ESM and Next.js's compiled CommonJS context
const configDir = path.dirname(fileURLToPath(import.meta.url));

// Startup check for required environment variables
function validateEmailConfig() {
  const apiKey = process.env.RESEND_API_KEY;
  const emailFrom = process.env.EMAIL_FROM;

  if (!apiKey || apiKey.trim() === "" || apiKey === "PASTE_YOUR_RESEND_KEY_HERE") {
    throw new Error(
      "❌ RESEND_API_KEY is not configured. Please set RESEND_API_KEY in .env.local file.\n" +
      "   Example: RESEND_API_KEY=\"re_xxxxxxxxxxxxx\""
    );
  }

  if (!emailFrom || emailFrom.trim() === "") {
    throw new Error(
      "❌ EMAIL_FROM is not configured. Please set EMAIL_FROM in .env.local file.\n" +
      "   Example: EMAIL_FROM=\"Agora <onboarding@resend.dev>\""
    );
  }

  // Validate email format (extract email from "Name <email@domain.com>" format)
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const emailMatch = emailFrom.match(/<([^>]+)>/) || [null, emailFrom];
  const actualEmail = emailMatch[1] || emailFrom;
  
  if (!emailRegex.test(actualEmail.trim())) {
    throw new Error(
      `❌ EMAIL_FROM is not a valid email address: ${emailFrom}\n` +
      "   Please set a valid email address in .env.local file.\n" +
      "   Example: EMAIL_FROM=\"Agora <onboarding@resend.dev>\""
    );
  }

  console.log("✅ Email configuration validated:");
  console.log(`   EMAIL_FROM: ${emailFrom}`);
  console.log(`   RESEND_API_KEY: ${apiKey.substring(0, 10)}...`);
}

// Only validate in development (skip in production builds)
if (process.env.NODE_ENV !== "production") {
  try {
    validateEmailConfig();
  } catch (error: any) {
    console.error("\n" + "=".repeat(60));
    console.error(error.message);
    console.error("=".repeat(60));
    console.error("\n⚠️  Email functionality will not work until configuration is complete.");
    console.error("   Create .env.local in the repo root with:\n");
    console.error("   RESEND_API_KEY=\"your-resend-api-key\"");
    console.error("   EMAIL_FROM=\"Agora <onboarding@resend.dev>\"\n");
    console.error("   Then restart the dev server.\n");
    // Don't throw - allow server to start but email features won't work
  }
}

const nextConfig: NextConfig = {
  // Explicitly set Turbopack root to prevent it from selecting wrong workspace
  // This ensures Next.js always uses this app directory as root, even if there
  // are other package-lock.json files in parent directories
  // Using path.resolve(configDir) ensures stable root regardless of CWD
  // configDir is computed from next.config.ts location, so it's always the repo root
  turbopack: {
    root: path.resolve(configDir),
  },
};

export default nextConfig;