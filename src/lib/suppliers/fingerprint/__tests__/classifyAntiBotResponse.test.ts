import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  classifyAntiBotResponse,
  inferBlockedUrlClass,
} from "../classifyAntiBotResponse";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
  console.log(`PASS: ${message}`);
}

const FIXTURES = join(__dirname, "fixtures");

function readFixture(name: string): string {
  return readFileSync(join(FIXTURES, name), "utf8");
}

console.log("\nclassifyAntiBotResponse tests\n");

assert(
  inferBlockedUrlClass("https://www.grainger.com/search?q=wire") === "search",
  "search URL class"
);
assert(
  inferBlockedUrlClass("https://www.grainger.com/product/ABC123") === "product",
  "product URL class"
);
assert(
  inferBlockedUrlClass("https://example.com/sitemap.xml") === "sitemap",
  "sitemap URL class"
);

const cloudflareBlock = readFixture("cloudflare-block.html");
const cf = classifyAntiBotResponse({
  status: 200,
  html: cloudflareBlock,
  url: "https://example.com/search?q=test",
});
assert(cf.antiBotCategory === "CLOUDFLARE_HARD_BLOCK", "Cloudflare hard block category");
assert(cf.antiBotRisk === "HARD_BLOCK", "Cloudflare hard block risk");
assert(cf.blockedUrlClass === "search", "Cloudflare block preserves URL class");

const captcha403 = classifyAntiBotResponse({
  status: 403,
  html: "Forbidden",
  url: "https://example.com/product/1",
});
assert(captcha403.antiBotCategory === "HTTP_403", "403 category");
assert(captcha403.antiBotRisk === "HARD_BLOCK", "403 risk");

const rateLimit = classifyAntiBotResponse({
  status: 429,
  html: "Too Many Requests",
  url: "https://example.com/",
});
assert(rateLimit.antiBotCategory === "HTTP_429", "429 category");
assert(rateLimit.antiBotRisk === "HIGH", "429 risk");

const loginWall = classifyAntiBotResponse({
  status: 200,
  html: "<html><body>Customer login required to shop</body></html>",
  url: "https://example.com/catalog",
});
assert(loginWall.antiBotCategory === "LOGIN_WALL", "login wall category");
assert(loginWall.antiBotRisk === "MEDIUM", "login wall risk");

const clean = classifyAntiBotResponse({
  status: 200,
  html: "<html><body><h1>Product title</h1></body></html>",
  url: "https://example.com/product/a",
});
assert(clean.antiBotCategory === "NONE", "clean page category");
assert(clean.antiBotRisk === "LOW", "clean page risk");

console.log("\nAll classifyAntiBotResponse tests passed.\n");
