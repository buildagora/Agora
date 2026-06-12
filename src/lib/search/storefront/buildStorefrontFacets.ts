import type { SupplierProductResult } from "@/lib/suppliers/types";
import {
  detectQueryAttributeDomains,
  parseQueryAttributes,
} from "./parseQueryAttributes";
import type { StorefrontDataProvenance, StorefrontFacetGroup } from "./types";

const MIN_FACET_COUNT = 2;
const MAX_GROUPS = 5;
const MAX_VALUES_PER_GROUP = 8;

type FacetTemplate = {
  id: string;
  label: string;
  patterns: { pattern: RegExp; label: string }[];
};

const FASTENER_FACETS: FacetTemplate[] = [
  {
    id: "material",
    label: "Material",
    patterns: [
      { pattern: /\bstainless\s+steel\b/i, label: "Stainless Steel" },
      { pattern: /\bzinc[\s-]?plated\b/i, label: "Zinc Plated" },
      { pattern: /\bbrass\b/i, label: "Brass" },
      { pattern: /\baluminum\b/i, label: "Aluminum" },
      { pattern: /\bsteel\b/i, label: "Steel" },
      { pattern: /\bgalvanized\b/i, label: "Galvanized" },
    ],
  },
  {
    id: "finish",
    label: "Finish",
    patterns: [
      { pattern: /\bblack\s+oxide\b/i, label: "Black Oxide" },
      { pattern: /\bchrome\b/i, label: "Chrome" },
      { pattern: /\bnickel\b/i, label: "Nickel" },
      { pattern: /\bplain\b/i, label: "Plain" },
    ],
  },
  {
    id: "length",
    label: "Length",
    patterns: [
      { pattern: /\b(\d+(?:\.\d+)?)\s*(?:in|inch|inches|")\b/i, label: "$1 in" },
    ],
  },
  {
    id: "diameter",
    label: "Diameter",
    patterns: [
      { pattern: /#(\d+)/, label: "#$1" },
      { pattern: /\b(\d+(?:\.\d+)?)\s*mm\b/i, label: "$1 mm" },
    ],
  },
];

const PAINT_FACETS: FacetTemplate[] = [
  {
    id: "finish",
    label: "Finish",
    patterns: [
      { pattern: /\bsemi[\s-]?gloss\b/i, label: "Semi-Gloss" },
      { pattern: /\beggshell\b/i, label: "Eggshell" },
      { pattern: /\bsatin\b/i, label: "Satin" },
      { pattern: /\bflat\b/i, label: "Flat" },
      { pattern: /\bgloss\b/i, label: "Gloss" },
    ],
  },
  {
    id: "application",
    label: "Interior / Exterior",
    patterns: [
      { pattern: /\binterior\b/i, label: "Interior" },
      { pattern: /\bexterior\b/i, label: "Exterior" },
    ],
  },
  {
    id: "color",
    label: "Color",
    patterns: [
      { pattern: /\bwhite\b/i, label: "White" },
      { pattern: /\b(gray|grey)\b/i, label: "Gray" },
      { pattern: /\bbeige\b/i, label: "Beige" },
      { pattern: /\bblue\b/i, label: "Blue" },
    ],
  },
];

const FLOORING_FACETS: FacetTemplate[] = [
  {
    id: "material",
    label: "Material",
    patterns: [
      { pattern: /\bvinyl\b/i, label: "Vinyl" },
      { pattern: /\blaminate\b/i, label: "Laminate" },
      { pattern: /\bhardwood\b/i, label: "Hardwood" },
      { pattern: /\btile\b/i, label: "Tile" },
      { pattern: /\bporcelain\b/i, label: "Porcelain" },
    ],
  },
  {
    id: "thickness",
    label: "Thickness",
    patterns: [
      { pattern: /\b(\d+(?:\.\d+)?)\s*mm\b/i, label: "$1 mm" },
      { pattern: /\b(\d+\/\d+)\s*(?:in|")\b/i, label: "$1 in" },
    ],
  },
];

function templatesForQuery(query: string, categoryId: string): FacetTemplate[] {
  const domains = detectQueryAttributeDomains(query);
  const cat = categoryId.toLowerCase();

  if (domains.includes("fasteners") || /\bfastener|screw|bolt|nail|anchor\b/i.test(query)) {
    return FASTENER_FACETS;
  }
  if (domains.includes("paint") || cat.includes("paint")) {
    return PAINT_FACETS;
  }
  if (/\bfloor|tile|vinyl|laminate|hardwood\b/i.test(query) || cat.includes("floor")) {
    return FLOORING_FACETS;
  }
  if (domains.includes("pipe")) {
    return [
      {
        id: "material",
        label: "Material",
        patterns: [
          { pattern: /\bpvc\b/i, label: "PVC" },
          { pattern: /\bcpvc\b/i, label: "CPVC" },
          { pattern: /\bpex\b/i, label: "PEX" },
          { pattern: /\bcopper\b/i, label: "Copper" },
        ],
      },
    ];
  }
  return FASTENER_FACETS.slice(0, 2);
}

function countMatches(
  products: SupplierProductResult[],
  pattern: RegExp
): number {
  return products.filter((p) => pattern.test(p.title)).length;
}

function extractCatalogFacets(
  products: SupplierProductResult[],
  query: string,
  categoryId: string,
  source: StorefrontDataProvenance
): StorefrontFacetGroup[] {
  if (products.length < MIN_FACET_COUNT) return [];

  const templates = templatesForQuery(query, categoryId);
  const groups: StorefrontFacetGroup[] = [];

  for (const template of templates) {
    if (groups.length >= MAX_GROUPS) break;

    const values: StorefrontFacetGroup["values"] = [];

    for (const { pattern, label } of template.patterns) {
      const count = countMatches(products, pattern);
      if (count < MIN_FACET_COUNT) continue;

      const resolvedLabel = label.replace(/\$(\d+)/g, (_, n: string) => {
        const sample = products.find((p) => pattern.test(p.title));
        if (!sample) return label;
        const m = sample.title.match(pattern);
        return m?.[Number(n)] ?? label;
      });

      values.push({
        id: `${template.id}:${resolvedLabel.toLowerCase().replace(/\s+/g, "-")}`,
        label: resolvedLabel,
        count,
      });
    }

    values.sort((a, b) => (b.count ?? 0) - (a.count ?? 0));

    if (values.length > 0) {
      groups.push({
        id: template.id,
        label: template.label,
        values: values.slice(0, MAX_VALUES_PER_GROUP),
        source,
      });
    }
  }

  return groups;
}

function queryAttributeFacets(
  query: string,
  source: StorefrontDataProvenance
): StorefrontFacetGroup[] {
  const attrs = parseQueryAttributes(query);
  if (attrs.length === 0) return [];

  const byLabel = new Map<string, StorefrontFacetGroup["values"]>();
  for (const attr of attrs) {
    const existing = byLabel.get(attr.label) ?? [];
    existing.push({
      id: `${attr.key}:${attr.value.toLowerCase()}`,
      label: attr.value,
    });
    byLabel.set(attr.label, existing);
  }

  return Array.from(byLabel.entries()).map(([label, values]) => ({
    id: label.toLowerCase().replace(/\s+/g, "-"),
    label,
    values,
    source,
  }));
}

export function buildStorefrontFacets(input: {
  query: string;
  categoryId: string;
  products: SupplierProductResult[];
  provenance: StorefrontDataProvenance;
}): StorefrontFacetGroup[] {
  const source =
    input.provenance === "NONE" ? ("SERP" as StorefrontDataProvenance) : input.provenance;

  const catalog = extractCatalogFacets(
    input.products,
    input.query,
    input.categoryId,
    source
  );
  const queryFacets = queryAttributeFacets(input.query, source);

  const seen = new Set(catalog.map((g) => g.id));
  const merged = [...catalog];
  for (const group of queryFacets) {
    if (seen.has(group.id)) continue;
    merged.push(group);
  }

  return merged.slice(0, MAX_GROUPS);
}
