#!/usr/bin/env tsx

/**
 * Dev server status checker.
 * Prints current environment, DNS resolution, and port binding status.
 */

import { execSync } from "child_process";
import { lookup } from "dns/promises";
import { existsSync } from "fs";
import { join } from "path";

async function main() {
  const cwd = process.cwd();

  console.log("=".repeat(80));
  console.log("Dev Server Status");
  console.log("=".repeat(80));
  console.log("");

  // 1. Current working directory
  console.log("📁 Current Working Directory:");
  console.log(`   ${cwd}`);
  console.log("");

  // 2. Node version
  const nodeVersion = process.version;
  console.log("🟢 Node Version:");
  console.log(`   ${nodeVersion}`);
  console.log("");

  // 3. DNS resolution for localhost
  console.log("🌐 DNS Resolution:");
  try {
    const ipv4 = await lookup("localhost", { family: 4 });
    console.log(`   localhost → ${ipv4.address} (IPv4)`);
  } catch (err: any) {
    console.log(`   localhost → IPv4 lookup failed: ${err.message}`);
  }

  try {
    const ipv6 = await lookup("localhost", { family: 6 });
    console.log(`   localhost → ${ipv6.address} (IPv6)`);
  } catch (err: any) {
    console.log(`   localhost → IPv6 lookup failed: ${err.message}`);
  }

  try {
    const ipv4127 = await lookup("127.0.0.1", { family: 4 });
    console.log(`   127.0.0.1 → ${ipv4127.address} (IPv4)`);
  } catch (err: any) {
    console.log(`   127.0.0.1 → IPv4 lookup failed: ${err.message}`);
  }
  console.log("");

  // 4. Port 3000 listening status
  console.log("🔌 Port 3000 Status:");
  try {
    const lsofOutput = execSync("lsof -nP -iTCP:3000 -sTCP:LISTEN", { encoding: "utf-8" });
    const lines = lsofOutput.trim().split("\n");
    if (lines.length > 1) {
      // Skip header line
      for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].trim().split(/\s+/);
        if (parts.length >= 9) {
          const command = parts[0];
          const pid = parts[1];
          const address = parts[8];
          console.log(`   ✅ Port 3000 is listening`);
          console.log(`      Process: ${command} (PID: ${pid})`);
          console.log(`      Address: ${address}`);
        }
      }
    } else {
      console.log("   ❌ Port 3000 is not listening");
    }
  } catch (err: any) {
    if (err.status === 1) {
      console.log("   ❌ Port 3000 is not listening");
    } else {
      console.log(`   ⚠️  Error checking port: ${err.message}`);
    }
  }
  console.log("");

  // 5. Project root validation
  console.log("📦 Project Root Validation:");
  const requiredFiles = ["package.json", "next.config.ts"];
  let allPresent = true;
  for (const file of requiredFiles) {
    const filePath = join(cwd, file);
    const exists = existsSync(filePath);
    console.log(`   ${exists ? "✅" : "❌"} ${file}`);
    if (!exists) allPresent = false;
  }

  if (allPresent) {
    console.log(`   ✅ Valid project root: ${cwd}`);
  } else {
    console.log(`   ❌ Invalid project root: ${cwd}`);
    console.log(`   Expected: /Users/michael/agora/agora`);
  }
  console.log("");

  console.log("=".repeat(80));
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
