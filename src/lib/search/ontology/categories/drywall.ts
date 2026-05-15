import type { ConstructionOntologyCategory } from "../types";

export const drywallOntologyCategory: ConstructionOntologyCategory = {
  categoryId: "drywall",
  label: "Drywall",
  coverageLevel: "baseline",
  productTypes: [
    {
      id: "drywall-panels",
      label: "Drywall Panels",
      aliases: ["drywall panel", "sheetrock", "gypsum board", "drywall board"],
      positiveTerms: ["drywall", "sheetrock", "gypsum", "panel", "board"],
      negativeTerms: ["breaker", "pex tubing"],
    },
    {
      id: "joint-compound",
      label: "Joint Compound",
      aliases: ["joint compound", "mud", "all purpose mud", "topping compound"],
      positiveTerms: ["joint compound", "mud", "topping"],
      negativeTerms: ["conduit", "copper pipe"],
    },
    {
      id: "drywall-tape",
      label: "Drywall Tape",
      aliases: ["drywall tape", "mesh tape", "paper tape"],
      positiveTerms: ["tape", "mesh tape", "paper tape"],
      negativeTerms: ["electrical tape", "duct tape"],
    },
    {
      id: "corner-bead",
      label: "Corner Bead",
      aliases: ["corner bead", "outside corner", "inside corner bead"],
      positiveTerms: ["corner bead", "corner"],
      negativeTerms: ["valve", "breaker"],
    },
    {
      id: "texture",
      label: "Texture",
      aliases: ["drywall texture", "orange peel texture", "knockdown texture"],
      positiveTerms: ["texture", "orange peel", "knockdown"],
      negativeTerms: ["panelboard", "conduit"],
    },
  ],
  brands: [
    { id: "usg", label: "USG", aliases: ["usg", "sheetrock"] },
    { id: "national-gypsum", label: "National Gypsum", aliases: ["national gypsum", "gold bond"] },
    { id: "certainteed-gypsum", label: "CertainTeed Gypsum", aliases: ["certainteed drywall"] },
  ],
  ambiguousTerms: ["panel", "tape", "compound"],
};

