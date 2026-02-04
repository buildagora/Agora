#!/usr/bin/env node
/**
 * Smoke test script for API endpoints
 * Verifies JSON responses, content-type, and basic functionality
 */

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  const contentType = response.headers.get("content-type") || "";
  const isJson = contentType.includes("application/json");

  let body;
  if (isJson) {
    body = await response.json();
  } else {
    body = await response.text();
  }

  // Get Set-Cookie header for auth tests
  const setCookie = response.headers.get("set-cookie") || "";

  return {
    ok: response.ok,
    status: response.status,
    contentType,
    isJson,
    body,
    setCookie,
  };
}

async function testHealthRuntime() {
  console.log("Testing GET /api/health/runtime...");
  const result = await fetchJson(`${BASE_URL}/api/health/runtime`);

  if (!result.isJson) {
    console.error("❌ FAIL: /api/health/runtime returned non-JSON");
    console.error(`   Content-Type: ${result.contentType}`);
    console.error(`   Body: ${result.body.substring(0, 200)}`);
    return false;
  }

  if (!result.body.ok) {
    console.error("❌ FAIL: /api/health/runtime returned ok:false");
    console.error(`   Response:`, result.body);
    return false;
  }

  if (!result.body.node || !result.body.runtime) {
    console.error("❌ FAIL: /api/health/runtime missing required fields");
    console.error(`   Response:`, result.body);
    return false;
  }

  console.log(`✓ /api/health/runtime: node=${result.body.node}, runtime=${result.body.runtime}, prismaLoaded=${result.body.prismaClientLoaded}`);
  return true;
}

async function testHealthPrisma() {
  console.log("Testing GET /api/health/prisma...");
  const result = await fetchJson(`${BASE_URL}/api/health/prisma`);

  if (!result.isJson) {
    console.error("❌ FAIL: /api/health/prisma returned non-JSON");
    console.error(`   Content-Type: ${result.contentType}`);
    console.error(`   Body: ${result.body.substring(0, 200)}`);
    return false;
  }

  if (result.body.ok && result.body.db === "up") {
    console.log("✓ /api/health/prisma: DB is up");
    return true;
  }

  if (!result.body.ok && result.body.code === "DB_DOWN") {
    console.log("⚠ /api/health/prisma: DB is down (expected in some environments)");
    return true; // This is acceptable
  }

  console.error("❌ FAIL: /api/health/prisma returned unexpected response");
  console.error(`   Response:`, result.body);
  return false;
}

async function testAuthMe() {
  console.log("Testing GET /api/auth/me (expect 401)...");
  const result = await fetchJson(`${BASE_URL}/api/auth/me`);

  if (!result.isJson) {
    console.error("❌ FAIL: /api/auth/me returned non-JSON");
    console.error(`   Content-Type: ${result.contentType}`);
    console.error(`   Body: ${result.body.substring(0, 200)}`);
    return false;
  }

  if (result.status === 401 && result.body.ok === false && result.body.code === "UNAUTHORIZED") {
    console.log("✓ /api/auth/me: Correctly returns 401 JSON for unauthenticated");
    return true;
  }

  console.error("❌ FAIL: /api/auth/me did not return expected 401 JSON");
  console.error(`   Status: ${result.status}`);
  console.error(`   Response:`, result.body);
  return false;
}

async function testAuthLoginBadCreds() {
  console.log("Testing POST /api/auth/login with bad creds (expect 401)...");
  const result = await fetchJson(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    body: JSON.stringify({
      email: "nonexistent@test.com",
      fullName: "Test",
    }),
  });

  if (!result.isJson) {
    console.error("❌ FAIL: /api/auth/login returned non-JSON");
    console.error(`   Content-Type: ${result.contentType}`);
    console.error(`   Body: ${result.body.substring(0, 200)}`);
    return false;
  }

  // Should return JSON error (could be 400, 401, or 500 depending on validation)
  if (!result.body.ok) {
    console.log(`✓ /api/auth/login: Correctly returns JSON error (status ${result.status})`);
    return true;
  }

  console.error("❌ FAIL: /api/auth/login did not return expected error JSON");
  console.error(`   Status: ${result.status}`);
  console.error(`   Response:`, result.body);
  return false;
}

async function testDevSeedUser() {
  console.log("Testing POST /api/dev/seed-user (DEV ONLY)...");
  const testEmail = `smoke-test-${Date.now()}@test.com`;
  
  const result = await fetchJson(`${BASE_URL}/api/dev/seed-user`, {
    method: "POST",
    body: JSON.stringify({
      email: testEmail,
      fullName: "Smoke Test User",
      role: "BUYER",
    }),
  });

  if (!result.isJson) {
    console.error("❌ FAIL: /api/dev/seed-user returned non-JSON");
    console.error(`   Content-Type: ${result.contentType}`);
    console.error(`   Body: ${result.body.substring(0, 200)}`);
    return false;
  }

  // In production or without ENABLE_DEV_LOGIN, should return 404
  if (result.status === 404) {
    console.log("⚠ /api/dev/seed-user: Returns 404 (expected if ENABLE_DEV_LOGIN not set or in production)");
    return true; // This is acceptable
  }

  if (!result.body.ok || !result.body.user) {
    console.error("❌ FAIL: /api/dev/seed-user did not return expected success JSON");
    console.error(`   Status: ${result.status}`);
    console.error(`   Response:`, result.body);
    return false;
  }

  console.log(`✓ /api/dev/seed-user: Created user ${result.body.user.email} (id: ${result.body.user.id})`);
  return { email: testEmail, userId: result.body.user.id };
}

async function testAuthLoginSuccess() {
  console.log("Testing POST /api/auth/login with seeded user (expect 200)...");
  
  // Require DEV_LOGIN_TOKEN for this test
  const devLoginToken = process.env.DEV_LOGIN_TOKEN;
  if (!devLoginToken) {
    console.log("⚠ Skipping login success test (DEV_LOGIN_TOKEN not set)");
    console.log("   Set DEV_LOGIN_TOKEN to run this test");
    return true; // This is acceptable
  }
  
  // First, seed a user (skip if seed fails)
  const seedResult = await testDevSeedUser();
  if (!seedResult || typeof seedResult === "boolean") {
    console.log("⚠ Skipping login success test (seed user failed or not available)");
    return true; // This is acceptable
  }

  const { email } = seedResult;

  // Now try to login with that email and dev token
  const result = await fetchJson(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: {
      "X-Dev-Login-Token": devLoginToken,
    },
    body: JSON.stringify({
      email: email,
    }),
  });

  if (!result.isJson) {
    console.error("❌ FAIL: /api/auth/login returned non-JSON");
    console.error(`   Content-Type: ${result.contentType}`);
    console.error(`   Body: ${result.body.substring(0, 200)}`);
    return false;
  }

  if (!result.body.ok || !result.body.user) {
    console.error("❌ FAIL: /api/auth/login did not return expected success JSON");
    console.error(`   Status: ${result.status}`);
    console.error(`   Response:`, result.body);
    return false;
  }

  // Check that cookie was set with the correct cookie name
  const cookieName = "agora.auth";
  if (!result.setCookie || !result.setCookie.includes(cookieName)) {
    console.error("❌ FAIL: /api/auth/login did not set auth cookie");
    console.error(`   Expected cookie name: ${cookieName}`);
    console.error(`   Set-Cookie header: ${result.setCookie || "(missing)"}`);
    return false;
  }

  console.log(`✓ /api/auth/login: Successfully logged in user ${result.body.user.email} (id: ${result.body.user.id})`);
  console.log(`   Auth cookie set: ${cookieName}`);
  return true;
}

async function testAuthLoginNoPassword() {
  console.log("Testing POST /api/auth/login without password (expect 400, password not implemented)...");
  
  // Try to login without password and without dev token (production path)
  const result = await fetchJson(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    body: JSON.stringify({
      email: "test@example.com",
      // No password field
    }),
  });

  if (!result.isJson) {
    console.error("❌ FAIL: /api/auth/login returned non-JSON");
    console.error(`   Content-Type: ${result.contentType}`);
    console.error(`   Body: ${result.body.substring(0, 200)}`);
    return false;
  }

  // Should return 400 with message about password not implemented
  if (
    result.status === 400 &&
    !result.body.ok &&
    result.body.message &&
    result.body.message.toLowerCase().includes("not implemented")
  ) {
    console.log(`✓ /api/auth/login: Correctly requires password (status ${result.status})`);
    console.log(`   Message: ${result.body.message}`);
    return true;
  }

  console.error("❌ FAIL: /api/auth/login did not return expected 400 error");
  console.error(`   Status: ${result.status}`);
  console.error(`   Response:`, result.body);
  return false;
}

async function main() {
  console.log(`Running smoke tests against ${BASE_URL}\n`);
  console.log("Note: Login tests require:");
  console.log("  - ENABLE_DEV_LOGIN=true");
  console.log("  - DEV_LOGIN_TOKEN=<your-secret-token>");
  console.log("  - NODE_ENV !== 'production'");
  console.log("Run with: ENABLE_DEV_LOGIN=true DEV_LOGIN_TOKEN=changeme npm run smoke\n");

  const tests = [
    testHealthRuntime,
    testHealthPrisma,
    testAuthMe,
    testAuthLoginBadCreds,
    testAuthLoginNoPassword,
    testAuthLoginSuccess,
  ];

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    try {
      const result = await test();
      if (result) {
        passed++;
      } else {
        failed++;
      }
    } catch (error) {
      console.error(`❌ FAIL: Test threw error:`, error.message);
      failed++;
    }
    console.log("");
  }

  console.log(`Results: ${passed} passed, ${failed} failed`);

  if (failed > 0) {
    process.exit(1);
  }

  console.log("✅ All smoke tests passed!");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});

