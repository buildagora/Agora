import { decodeHtmlEntities } from "../decodeHtmlEntities";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
  console.log(`PASS: ${message}`);
}

console.log("\ndecodeHtmlEntities tests\n");

assert(
  decodeHtmlEntities("Refrigerants &amp; Tanks") === "Refrigerants & Tanks",
  "decodes named amp entity"
);
assert(
  decodeHtmlEntities("No entities here") === "No entities here",
  "passes through plain text"
);
assert(decodeHtmlEntities("&#38;") === "&", "decodes numeric entity");
assert(decodeHtmlEntities("&#x26;") === "&", "decodes hex entity");
assert(decodeHtmlEntities("&nbsp;space") === " space", "decodes nbsp");

console.log("\nAll decodeHtmlEntities tests passed.\n");
