import type { ConstructionOntologyCategory } from "../types";

export const glassGlazingOntologyCategory: ConstructionOntologyCategory = {
  categoryId: "glass_glazing",
  label: "Glass & Glazing",
  coverageLevel: "baseline",
  productTypes: [
    {
      id: "glass-panels",
      label: "Glass Panels",
      aliases: ["tempered glass panel", "clear glass panel", "laminated glass panel"],
      positiveTerms: ["tempered glass panel", "clear glass panel", "laminated glass panel"],
      negativeTerms: ["solar panel glass", "phone glass"],
    },
    {
      id: "insulated-glass-units",
      label: "Insulated Glass Units",
      aliases: ["insulated glass unit", "igu glass", "dual pane igu"],
      positiveTerms: ["insulated glass unit", "igu glass", "dual pane igu"],
      negativeTerms: ["foam insulation board", "window film only"],
    },
    {
      id: "storefront-glass",
      label: "Storefront Glass",
      aliases: ["storefront glass", "commercial storefront glass", "storefront glazing"],
      positiveTerms: ["storefront glass", "commercial storefront glass", "storefront glazing"],
      negativeTerms: ["retail display case", "interior mirror panel"],
    },
    {
      id: "mirrors",
      label: "Mirrors",
      aliases: ["wall mirror", "vanity mirror", "frameless mirror"],
      positiveTerms: ["wall mirror", "vanity mirror", "frameless mirror"],
      negativeTerms: ["mirror clips only", "security mirror dome"],
    },
    {
      id: "glazing-tape",
      label: "Glazing Tape",
      aliases: ["glazing tape", "window glazing tape", "double-sided glazing tape"],
      positiveTerms: ["glazing tape", "window glazing tape", "double-sided glazing tape"],
      negativeTerms: ["drywall tape", "electrical tape"],
    },
    {
      id: "glass-hardware",
      label: "Glass Hardware",
      aliases: ["glass clamps", "glass standoff hardware", "glass door hinges"],
      positiveTerms: ["glass clamps", "glass standoff", "glass door hinges"],
      negativeTerms: ["cabinet hardware", "gate hinges"],
    },
    {
      id: "shower-glass",
      label: "Shower Glass",
      aliases: ["shower glass", "shower glass panels", "frameless shower glass", "shower enclosure glass"],
      positiveTerms: ["shower glass", "shower glass panels", "frameless shower glass", "shower enclosure glass"],
      negativeTerms: ["shower curtain", "acrylic shower surround"],
    },
  ],
  brands: [
    { id: "crl", label: "CRL", aliases: ["crl", "c.r. laurence"] },
    { id: "guardian-glass", label: "Guardian Glass", aliases: ["guardian glass", "guardian"] },
    { id: "vitro", label: "Vitro", aliases: ["vitro glass", "vitro"] },
  ],
  ambiguousTerms: ["glass", "glazing", "mirror"],
};

