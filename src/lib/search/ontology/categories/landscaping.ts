import type { ConstructionOntologyCategory } from "../types";

export const landscapingOntologyCategory: ConstructionOntologyCategory = {
  categoryId: "landscaping",
  label: "Landscaping",
  coverageLevel: "baseline",
  productTypes: [
    {
      id: "mulch",
      label: "Mulch",
      aliases: ["landscape mulch", "hardwood mulch", "colored mulch"],
      positiveTerms: ["landscape mulch", "hardwood mulch", "colored mulch"],
      negativeTerms: ["mulch glue", "wood chips fuel"],
    },
    {
      id: "soil",
      label: "Soil",
      aliases: ["topsoil", "garden soil", "planting soil", "fill dirt"],
      positiveTerms: ["topsoil", "garden soil", "planting soil", "fill dirt"],
      negativeTerms: ["soil test kit", "potting tray"],
    },
    {
      id: "gravel",
      label: "Gravel",
      aliases: ["landscape gravel", "pea gravel", "drainage gravel"],
      positiveTerms: ["landscape gravel", "pea gravel", "drainage gravel"],
      negativeTerms: ["gravel bike tires", "decorative beads"],
    },
    {
      id: "pavers",
      label: "Pavers",
      aliases: ["concrete pavers", "patio pavers", "interlocking pavers"],
      positiveTerms: ["concrete pavers", "patio pavers", "interlocking pavers"],
      negativeTerms: ["paver sealer only", "brick veneer"],
    },
    {
      id: "landscape-edging",
      label: "Landscape Edging",
      aliases: ["landscape edging", "garden edging", "edging border"],
      positiveTerms: ["landscape edging", "garden edging", "edging border"],
      negativeTerms: ["drip edge roofing", "trim edging"],
    },
    {
      id: "plants-shrubs",
      label: "Plants & Shrubs",
      aliases: ["landscape shrubs", "foundation plants", "ornamental shrubs"],
      positiveTerms: ["landscape shrubs", "foundation plants", "ornamental shrubs"],
      negativeTerms: ["shrub trimmer", "artificial plants"],
    },
    {
      id: "irrigation-supplies",
      label: "Irrigation Supplies",
      aliases: ["irrigation supplies", "drip irrigation", "sprinkler irrigation", "irrigation fittings"],
      positiveTerms: ["irrigation supplies", "drip irrigation", "sprinkler irrigation"],
      negativeTerms: ["hvac line set", "electrical conduit"],
    },
  ],
  brands: [
    { id: "rain-bird", label: "Rain Bird", aliases: ["rain bird", "rainbird"] },
    { id: "orbit", label: "Orbit", aliases: ["orbit irrigation", "orbit"] },
    { id: "scotts", label: "Scotts", aliases: ["scotts"] },
  ],
  ambiguousTerms: ["edging", "soil", "plants"],
};

