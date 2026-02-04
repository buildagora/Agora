#!/usr/bin/env node

/**
 * Script to write Agora lockup PNG from base64
 * 
 * Usage: 
 *   node scripts/write-agora-logo.mjs
 *   OR
 *   AGORA_LOGO_BASE64="<base64>" node scripts/write-agora-logo.mjs
 * 
 * Reads base64 from environment variable AGORA_LOGO_BASE64
 * Writes to public/brand/agora-lockup.png
 */

import { writeFileSync, mkdirSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, "..");

// Try to read from environment variable first, then from file
let base64Data = process.env.AGORA_LOGO_BASE64 || "";

if (!base64Data) {
  // Try reading from file
  try {
    const base64File = join(projectRoot, "scripts", "agoraLogoBase64.txt");
    base64Data = readFileSync(base64File, "utf8").trim();
  } catch (error) {
    // File doesn't exist or can't be read
  }
}

if (!base64Data || base64Data.length < 100) {
  console.error("Error: Base64 PNG data not found or incomplete");
  console.error("Please provide the complete base64 PNG data in one of these ways:");
  console.error("  1. Set AGORA_LOGO_BASE64 environment variable");
  console.error("  2. Place base64 data in scripts/agoraLogoBase64.txt");
  console.error("");
  console.error("Note: The base64 data provided in the user message appears to be truncated.");
  console.error("Please provide the complete base64 string for the PNG image.");
  process.exit(1);
}

try {
  // Remove any whitespace/newlines from base64
  const cleanBase64 = base64Data.replace(/\s/g, "");
  
  // Convert base64 to buffer
  const buffer = Buffer.from(cleanBase64, "base64");
  
  // Validate it's a PNG (starts with PNG signature)
  if (buffer[0] !== 0x89 || buffer[1] !== 0x50 || buffer[2] !== 0x4E || buffer[3] !== 0x47) {
    console.error("Warning: Data doesn't appear to be a valid PNG file");
    console.error("PNG files should start with: 89 50 4E 47");
  }
  
  // Ensure directory exists
  const outputDir = join(projectRoot, "public", "brand");
  mkdirSync(outputDir, { recursive: true });
  
  // Write PNG file
  const outputPath = join(outputDir, "agora-lockup.png");
  writeFileSync(outputPath, buffer);
  
  console.log(`✓ Successfully wrote logo to ${outputPath}`);
  console.log(`  File size: ${buffer.length} bytes`);
} catch (error) {
  console.error("Error writing logo file:", error.message);
  console.error("");
  console.error("Common issues:");
  console.error("  - Invalid base64 data (contains non-base64 characters)");
  console.error("  - Incomplete base64 string (truncated)");
  process.exit(1);
}
