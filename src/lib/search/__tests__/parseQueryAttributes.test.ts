/**
 * parseQueryAttributes tests (PR 2). Precision over recall.
 * Run: npm run test:parse-query-attributes
 */

import {
  detectQueryAttributeDomains,
  parseQueryAttributes,
} from "../storefront/parseQueryAttributes";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
  console.log(`PASS: ${message}`);
}

function keys(attrs: ReturnType<typeof parseQueryAttributes>): string[] {
  return attrs.map((a) => a.key);
}

function getValue(
  attrs: ReturnType<typeof parseQueryAttributes>,
  key: string
): string | undefined {
  return attrs.find((a) => a.key === key)?.value;
}

console.log("\nparseQueryAttributes tests\n");

// --- Paint ---
const paintFull = parseQueryAttributes("white eggshell interior paint");
assert(keys(paintFull).includes("color"), "paint: extracts color");
assert(getValue(paintFull, "color") === "White", "paint: color white");
assert(getValue(paintFull, "finish") === "Eggshell", "paint: finish eggshell");
assert(
  getValue(paintFull, "application") === "Interior",
  "paint: interior application"
);
assert(!keys(paintFull).includes("material"), "paint: no spurious material");

const paintSize = parseQueryAttributes("BEHR Premium Plus 1 gal interior paint");
assert(getValue(paintSize, "size") === "1 gal", "paint: size 1 gal");

assert(
  parseQueryAttributes("paint").length === 0,
  "paint: bare query extracts nothing beyond domain"
);

// --- Pipe ---
const pipeFull = parseQueryAttributes("2 inch schedule 40 pvc pipe 10 ft");
assert(getValue(pipeFull, "material") === "PVC", "pipe: material when pvc present");
assert(getValue(pipeFull, "diameter") === "2 in", "pipe: diameter 2 in");
assert(getValue(pipeFull, "schedule") === "40", "pipe: schedule 40");
assert(getValue(pipeFull, "length") === "10 ft", "pipe: length 10 ft");

const pipeNoPvc = parseQueryAttributes("2 inch schedule 40 pipe 10 ft");
assert(
  !keys(pipeNoPvc).includes("material"),
  "pipe: no material PVC when pvc absent"
);
assert(getValue(pipeNoPvc, "diameter") === "2 in", "pipe: diameter without pvc");
assert(
  getValue(pipeNoPvc, "schedule") === "40",
  "pipe: schedule without pvc"
);

// --- Fasteners ---
const screws = parseQueryAttributes("#8 x 2 drywall screws");
assert(getValue(screws, "gauge") === "#8", "fasteners: gauge");
assert(getValue(screws, "length") === "2 in", "fasteners: length from # x pattern");
assert(!keys(screws).includes("material"), "fasteners: no material when absent");

const screwHead = parseQueryAttributes(
  "#8-18 x 1/2 in phillips pan head machine screws steel"
);
assert(getValue(screwHead, "gauge") === "#8", "fasteners: gauge with thread count");
assert(getValue(screwHead, "length") === "1/2 in", "fasteners: fractional length");
assert(getValue(screwHead, "driveType") === "Phillips", "fasteners: drive type");
assert(getValue(screwHead, "headType") === "Pan Head", "fasteners: head type");
assert(getValue(screwHead, "material") === "Steel", "fasteners: material steel");

// --- Cross-domain / negative ---
assert(
  parseQueryAttributes("looking for suppliers near me").length === 0,
  "no domain: empty"
);
assert(
  parseQueryAttributes("steep slope roofing").length === 0,
  "roofing: no paint/pipe/fastener attributes"
);

const flatWasher = parseQueryAttributes("flat washers zinc");
assert(
  !keys(flatWasher).includes("finish"),
  "fasteners: flat washers do not extract paint finish"
);

// --- Domains ---
assert(
  detectQueryAttributeDomains("white interior paint").includes("paint"),
  "detect: paint domain"
);
assert(
  detectQueryAttributeDomains("schedule 40 pvc").includes("pipe"),
  "detect: pipe domain"
);
assert(
  detectQueryAttributeDomains("#8 screws").includes("fasteners"),
  "detect: fasteners domain"
);

console.log("\nAll parseQueryAttributes tests passed.\n");
