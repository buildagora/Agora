import { normalizeCanonicalDomain } from "../normalizeCanonicalDomain";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
  console.log(`PASS: ${message}`);
}

console.log("\nnormalizeCanonicalDomain tests\n");

assert(
  normalizeCanonicalDomain("https://www.flooranddecor.com/") === "flooranddecor.com",
  "strips protocol, www, and trailing slash"
);
assert(
  normalizeCanonicalDomain("[www.lowes.com](http://www.lowes.com)") === "lowes.com",
  "extracts host from markdown link"
);
assert(
  normalizeCanonicalDomain("LOWES.COM/path") === "lowes.com",
  "uppercase host and strips path"
);
assert(normalizeCanonicalDomain(null) === null, "null → null");
assert(normalizeCanonicalDomain("") === null, "empty → null");
assert(normalizeCanonicalDomain("   ") === null, "whitespace → null");
assert(
  normalizeCanonicalDomain("www.homedepot.com?foo=1") === "homedepot.com",
  "strips query string"
);

console.log("\nAll normalizeCanonicalDomain tests passed.\n");
