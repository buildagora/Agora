import type { ConstructionOntologyCategory } from "../types";

export const paintOntologyCategory: ConstructionOntologyCategory = {
  categoryId: "paint",
  label: "Paint",
  coverageLevel: "baseline",
  productTypes: [
    {
      id: "interior-paint",
      label: "Interior Paint",
      aliases: ["interior paint", "interior wall paint", "interior latex paint"],
      positiveTerms: ["interior paint", "interior wall paint", "interior latex"],
      negativeTerms: ["exterior stain", "spray foam"],
    },
    {
      id: "exterior-paint",
      label: "Exterior Paint",
      aliases: ["exterior paint", "exterior house paint", "exterior acrylic paint"],
      positiveTerms: ["exterior paint", "house paint exterior", "exterior acrylic"],
      negativeTerms: ["interior primer", "interior wall paint"],
    },
    {
      id: "primer",
      label: "Primer",
      aliases: ["paint primer", "bonding primer", "stain blocking primer"],
      positiveTerms: ["paint primer", "bonding primer", "stain blocking primer"],
      negativeTerms: ["tile primer mortar", "fuel primer bulb"],
    },
    {
      id: "stain",
      label: "Stain",
      aliases: ["wood stain", "deck stain", "oil-based stain"],
      positiveTerms: ["wood stain", "deck stain", "oil-based stain"],
      negativeTerms: ["stain blocker primer", "fabric stain remover"],
    },
    {
      id: "caulk",
      label: "Caulk",
      aliases: ["paintable caulk", "acrylic latex caulk", "siliconized caulk"],
      positiveTerms: ["paintable caulk", "acrylic latex caulk", "siliconized caulk"],
      negativeTerms: ["roof sealant", "construction adhesive"],
    },
    {
      id: "paint-supplies",
      label: "Paint Supplies",
      aliases: ["paint roller", "paint brush", "paint tray", "painter tape"],
      positiveTerms: ["paint roller", "paint brush", "paint tray", "painter tape"],
      negativeTerms: ["duct tape", "mesh drywall tape"],
    },
    {
      id: "sealers",
      label: "Sealers",
      aliases: ["paint sealer", "masonry sealer", "concrete sealer"],
      positiveTerms: ["paint sealer", "masonry sealer", "concrete sealer"],
      negativeTerms: ["joint sealer tape", "pipe thread sealant"],
    },
  ],
  brands: [
    { id: "sherwin-williams", label: "Sherwin-Williams", aliases: ["sherwin williams", "sherwin-williams"] },
    { id: "behr", label: "BEHR", aliases: ["behr"] },
    { id: "benjamin-moore", label: "Benjamin Moore", aliases: ["benjamin moore"] },
  ],
  ambiguousTerms: ["primer", "sealer", "caulk"],
};

