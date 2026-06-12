export type CategoryBrowseAliasConfig = {
  pathTerms: string[];
  /** Homepage path fragments to fetch for one-hop subcategory discovery. */
  parentExpansionPaths?: string[];
};

/**
 * Generic browse-path aliases keyed by construction ontology productType id.
 * Maps query semantics to common supplier category URL slug vocabulary.
 */
export const CATEGORY_BROWSE_ALIASES: Record<string, CategoryBrowseAliasConfig> =
  {
    furnace: {
      pathTerms: [
        "furnace",
        "residential-equipment",
        "residential equipment",
        "heating",
      ],
    },
    condenser: {
      pathTerms: [
        "condenser",
        "condensing",
        "residential-equipment",
        "mini-split",
        "cooling",
      ],
    },
    thermostat: {
      pathTerms: ["thermostat", "thermostats", "controls", "hvac-controls"],
      parentExpansionPaths: ["hvac-parts"],
    },
    "heat-pump": {
      pathTerms: ["heat-pump", "mini-split", "residential-equipment"],
    },
    "air-handler": {
      pathTerms: ["air-handler", "residential-equipment", "fan-coil"],
    },
    "refrigerant-line-set": {
      pathTerms: ["refrigerant", "refrigerants", "refrigerants-tanks"],
    },
    ductwork: {
      pathTerms: ["duct", "flex-insulation", "sheet-metal", "air-movement"],
    },
    "package-unit": {
      pathTerms: ["commercial-equipment", "package-unit", "rooftop"],
    },
  };

/** Multi-word / colloquial query aliases not tied to a single product type id. */
export const QUERY_BROWSE_ALIASES: Record<string, string[]> = {
  "hvac parts": ["hvac-parts", "hvac parts", "parts"],
  refrigerant: ["refrigerant", "refrigerants", "refrigerants-tanks"],
};

export function getBrowseAliasConfig(
  productTypeId: string
): CategoryBrowseAliasConfig | null {
  return CATEGORY_BROWSE_ALIASES[productTypeId] ?? null;
}
