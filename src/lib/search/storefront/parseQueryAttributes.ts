import type { StorefrontExtractedAttribute } from "./types";

/** Keeps # and / for screw and fractional pipe patterns (productSearchQuery strips #). */
function normalizeForAttributes(text: string): string {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s#/.-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export type QueryAttributeDomain = "paint" | "pipe" | "fasteners";

const PAINT_ANCHORS =
  /\b(paint|primer|latex|eggshell|enamel|stain|behr|glidden|sherwin|interior\s+paint|exterior\s+paint)\b/;

const PIPE_ANCHORS =
  /\b(pvc|cpvc|pex|abs|pipe|conduit|plumbing|schedule\s*\d|sch\s*\d|sdr\s*\d)\b/;

const FASTENER_ANCHORS =
  /\b(screw|screws|bolt|bolts|nut|nuts|washer|washers|fastener|fasteners|drywall|machine\s+screw|wood\s+screw|deck\s+screw)\b|#\d+\s*x\s*\d/i;

/** Paint colors — token must appear as a whole word in the query. */
const PAINT_COLOR_TERMS: { pattern: RegExp; label: string }[] = [
  { pattern: /\bwhite\b/, label: "White" },
  { pattern: /\b(gray|grey)\b/, label: "Gray" },
  { pattern: /\bbeige\b/, label: "Beige" },
  { pattern: /\bblue\b/, label: "Blue" },
  { pattern: /\bgreen\b/, label: "Green" },
  { pattern: /\bbrown\b/, label: "Brown" },
  { pattern: /\bblack\b/, label: "Black" },
  { pattern: /\bred\b/, label: "Red" },
  { pattern: /\byellow\b/, label: "Yellow" },
  { pattern: /\bpurple\b/, label: "Purple" },
  { pattern: /\bpink\b/, label: "Pink" },
  { pattern: /\borange\b/, label: "Orange" },
  { pattern: /\bcharcoal\b/, label: "Charcoal" },
];

const PAINT_FINISH_TERMS: { pattern: RegExp; label: string }[] = [
  { pattern: /\bsemi[\s-]?gloss\b/, label: "Semi-Gloss" },
  { pattern: /\bhigh[\s-]?gloss\b/, label: "High-Gloss" },
  { pattern: /\beggshell\b/, label: "Eggshell" },
  { pattern: /\bsatin\b/, label: "Satin" },
  { pattern: /\bflat\b/, label: "Flat" },
  { pattern: /\bmatte\b/, label: "Matte" },
  { pattern: /\bgloss\b/, label: "Gloss" },
  { pattern: /\bpearl\b/, label: "Pearl" },
];

const PIPE_MATERIAL_TERMS: { pattern: RegExp; key: string; label: string; value: string }[] = [
  { pattern: /\bcpvc\b/, key: "material", label: "Material", value: "CPVC" },
  { pattern: /\bpvc\b/, key: "material", label: "Material", value: "PVC" },
  { pattern: /\bpex\b/, key: "material", label: "Material", value: "PEX" },
  { pattern: /\babs\b/, key: "material", label: "Material", value: "ABS" },
  { pattern: /\bcopper\b/, key: "material", label: "Material", value: "Copper" },
  { pattern: /\bhdpe\b/, key: "material", label: "Material", value: "HDPE" },
  { pattern: /\bcast\s+iron\b/, key: "material", label: "Material", value: "Cast Iron" },
  { pattern: /\bgalvanized\b/, key: "material", label: "Material", value: "Galvanized" },
  { pattern: /\bstainless\s+steel\b/, key: "material", label: "Material", value: "Stainless Steel" },
  { pattern: /\bsteel\b/, key: "material", label: "Material", value: "Steel" },
];

const FASTENER_MATERIAL_TERMS: { pattern: RegExp; value: string }[] = [
  { pattern: /\bstainless\s+steel\b/, value: "Stainless Steel" },
  { pattern: /\bstainless\b/, value: "Stainless Steel" },
  { pattern: /\bzinc[\s-]?plated\b/, value: "Zinc Plated" },
  { pattern: /\bbrass\b/, value: "Brass" },
  { pattern: /\baluminum\b/, value: "Aluminum" },
  { pattern: /\bsteel\b/, value: "Steel" },
  { pattern: /\bzinc\b/, value: "Zinc" },
];

const HEAD_TYPE_PHRASES: { pattern: RegExp; label: string }[] = [
  { pattern: /\bpan\s+head\b/, label: "Pan Head" },
  { pattern: /\bflat\s+head\b/, label: "Flat Head" },
  { pattern: /\bround\s+head\b/, label: "Round Head" },
  { pattern: /\bhex\s+head\b/, label: "Hex Head" },
  { pattern: /\btruss\s+head\b/, label: "Truss Head" },
  { pattern: /\boval\s+head\b/, label: "Oval Head" },
  { pattern: /\bbutton\s+head\b/, label: "Button Head" },
];

const DRIVE_TYPE_PHRASES: { pattern: RegExp; label: string }[] = [
  { pattern: /\bphillips\b/, label: "Phillips" },
  { pattern: /\bslotted\b/, label: "Slotted" },
  { pattern: /\btorx\b/, label: "Torx" },
  { pattern: /\bsquare\s+drive\b/, label: "Square Drive" },
  { pattern: /\bpozidriv\b/, label: "Pozidriv" },
  { pattern: /\bhex\s+drive\b/, label: "Hex Drive" },
];

function attr(
  key: string,
  label: string,
  value: string
): StorefrontExtractedAttribute {
  return { key, label, value };
}

function pushUnique(
  out: StorefrontExtractedAttribute[],
  seen: Set<string>,
  item: StorefrontExtractedAttribute
): void {
  if (seen.has(item.key)) return;
  seen.add(item.key);
  out.push(item);
}

/**
 * Conservative domain detection — a domain runs only when the query contains
 * an explicit anchor term for that family (precision over recall).
 */
export function detectQueryAttributeDomains(query: string): QueryAttributeDomain[] {
  const q = normalizeForAttributes(query);
  if (!q) return [];

  const domains: QueryAttributeDomain[] = [];
  if (PAINT_ANCHORS.test(q)) domains.push("paint");
  if (PIPE_ANCHORS.test(q)) domains.push("pipe");
  if (FASTENER_ANCHORS.test(q)) domains.push("fasteners");
  return domains;
}

function extractPaintAttributes(q: string): StorefrontExtractedAttribute[] {
  const out: StorefrontExtractedAttribute[] = [];
  const seen = new Set<string>();

  for (const { pattern, label } of PAINT_COLOR_TERMS) {
    if (pattern.test(q)) {
      pushUnique(out, seen, attr("color", "Color", label));
      break;
    }
  }

  for (const { pattern, label } of PAINT_FINISH_TERMS) {
    if (pattern.test(q)) {
      pushUnique(out, seen, attr("finish", "Finish", label));
      break;
    }
  }

  if (/\binterior\b/.test(q)) {
    pushUnique(out, seen, attr("application", "Interior/Exterior", "Interior"));
  } else if (/\bexterior\b/.test(q)) {
    pushUnique(out, seen, attr("application", "Interior/Exterior", "Exterior"));
  }

  const sizeMatch = q.match(
    /\b(\d+(?:\.\d+)?)\s*(gal|gallon|gallons|qt|quart|quarts|oz|ounce|ounces|l|liter|litre)s?\b/
  );
  if (sizeMatch) {
    const num = sizeMatch[1];
    const unitRaw = sizeMatch[2];
    const unit =
      unitRaw.startsWith("gal")
        ? "gal"
        : unitRaw.startsWith("qt") || unitRaw === "quart"
          ? "qt"
          : unitRaw.startsWith("oz") || unitRaw === "ounce"
            ? "oz"
            : "L";
    pushUnique(out, seen, attr("size", "Size", `${num} ${unit}`));
  }

  return out;
}

function formatLengthInches(num: string): string {
  return `${num} in`;
}

function extractPipeAttributes(q: string): StorefrontExtractedAttribute[] {
  const out: StorefrontExtractedAttribute[] = [];
  const seen = new Set<string>();

  for (const term of PIPE_MATERIAL_TERMS) {
    if (term.pattern.test(q)) {
      pushUnique(out, seen, attr(term.key, term.label, term.value));
      break;
    }
  }

  const diameterMatch =
    q.match(/\b(\d+-\d+\/\d+)\s*(?:in|inch|inches)\b/) ??
    q.match(/\b(\d+(?:\.\d+)?(?:\s*\/\s*\d+)?)\s*(?:in|inch|inches)\b/) ??
    q.match(/\b(\d+(?:\.\d+)?)\s*"\b/);
  if (diameterMatch) {
    pushUnique(
      out,
      seen,
      attr("diameter", "Diameter", formatLengthInches(diameterMatch[1].replace(/\s+/g, "")))
    );
  }

  const lengthMatch = q.match(
    /\b(\d+(?:\.\d+)?)\s*(?:ft|foot|feet)\b|(\d+(?:\.\d+)?)\s*'\b/
  );
  if (lengthMatch) {
    const num = lengthMatch[1] ?? lengthMatch[2];
    pushUnique(out, seen, attr("length", "Length", `${num} ft`));
  }

  const scheduleMatch =
    q.match(/\bschedule\s*(\d+[a-z]?)\b/i) ?? q.match(/\bsch(?:edule)?\s*(\d+[a-z]?)\b/i);
  if (scheduleMatch) {
    pushUnique(out, seen, attr("schedule", "Schedule", scheduleMatch[1]));
  } else {
    const sdrMatch = q.match(/\bsdr\s*(\d+[a-z]?)\b/i);
    if (sdrMatch) {
      pushUnique(out, seen, attr("schedule", "Schedule", `SDR ${sdrMatch[1]}`));
    }
  }

  return out;
}

function extractFastenerAttributes(q: string): StorefrontExtractedAttribute[] {
  const out: StorefrontExtractedAttribute[] = [];
  const seen = new Set<string>();

  const gaugeMatch = q.match(/#(\d+)(?:-\d+)?\b/);
  if (gaugeMatch) {
    pushUnique(out, seen, attr("gauge", "Gauge", `#${gaugeMatch[1]}`));
  } else {
    const gaugeWord = q.match(/\bgauge\s*(\d+)\b/);
    if (gaugeWord) {
      pushUnique(out, seen, attr("gauge", "Gauge", `#${gaugeWord[1]}`));
    }
  }

  const screwLengthMatch = q.match(
    /#\d+(?:-\d+)?\s*x\s*(\d+(?:\.\d+)?(?:\/\d+)?)\s*(?:in|inch|inches|")?\b/
  );
  if (screwLengthMatch) {
    pushUnique(
      out,
      seen,
      attr("length", "Length", formatLengthInches(screwLengthMatch[1]))
    );
  } else if (/\b(?:screw|screws|bolt|bolts)\b/.test(q)) {
    const inchLength = q.match(/\b(\d+(?:\.\d+)?)\s*(?:in|inch|inches)\b/);
    if (inchLength) {
      pushUnique(
        out,
        seen,
        attr("length", "Length", formatLengthInches(inchLength[1]))
      );
    }
  }

  for (const { pattern, value } of FASTENER_MATERIAL_TERMS) {
    if (pattern.test(q)) {
      pushUnique(out, seen, attr("material", "Material", value));
      break;
    }
  }

  for (const { pattern, label } of HEAD_TYPE_PHRASES) {
    if (pattern.test(q)) {
      pushUnique(out, seen, attr("headType", "Head Type", label));
      break;
    }
  }

  for (const { pattern, label } of DRIVE_TYPE_PHRASES) {
    if (pattern.test(q)) {
      pushUnique(out, seen, attr("driveType", "Drive Type", label));
      break;
    }
  }

  return out;
}

/**
 * Extract display attributes from a product query. Precision-first: only
 * attributes with explicit evidence in the query string are returned.
 */
export function parseQueryAttributes(query: string): StorefrontExtractedAttribute[] {
  const q = normalizeForAttributes(query);
  if (!q) return [];

  const domains = detectQueryAttributeDomains(q);
  if (domains.length === 0) return [];

  const out: StorefrontExtractedAttribute[] = [];
  const seen = new Set<string>();

  for (const domain of domains) {
    const extracted =
      domain === "paint"
        ? extractPaintAttributes(q)
        : domain === "pipe"
          ? extractPipeAttributes(q)
          : extractFastenerAttributes(q);

    for (const item of extracted) {
      pushUnique(out, seen, item);
    }
  }

  return out;
}
