import type { ConstructionOntologyCategory } from "../types";

export const tileStoneOntologyCategory: ConstructionOntologyCategory = {
  categoryId: "tile_stone",
  label: "Tile & Stone",
  coverageLevel: "baseline",
  productTypes: [
    {
      id: "ceramic-tile",
      label: "Ceramic Tile",
      aliases: ["ceramic tile", "ceramic floor tile", "ceramic wall tile"],
      positiveTerms: ["ceramic tile", "ceramic floor tile", "ceramic wall tile"],
      negativeTerms: ["porcelain sink", "ceramic coating"],
    },
    {
      id: "porcelain-tile",
      label: "Porcelain Tile",
      aliases: ["porcelain tile", "porcelain floor tile", "porcelain wall tile"],
      positiveTerms: ["porcelain tile", "porcelain floor tile", "porcelain wall tile"],
      negativeTerms: ["porcelain fixture", "porcelain vanity"],
    },
    {
      id: "natural-stone-tile",
      label: "Natural Stone Tile",
      aliases: ["natural stone tile", "travertine tile", "marble tile", "slate tile"],
      positiveTerms: ["natural stone tile", "travertine tile", "marble tile", "slate tile"],
      negativeTerms: ["stone veneer siding", "decorative stone"],
    },
    {
      id: "grout",
      label: "Grout",
      aliases: ["tile grout", "sanded grout", "unsanded grout"],
      positiveTerms: ["tile grout", "sanded grout", "unsanded grout"],
      negativeTerms: ["drywall mud", "mortar mix concrete"],
    },
    {
      id: "thinset-mortar",
      label: "Thinset Mortar",
      aliases: ["thinset mortar", "tile thinset", "polymer modified thinset"],
      positiveTerms: ["thinset mortar", "tile thinset", "modified thinset"],
      negativeTerms: ["type s mortar", "masonry mortar"],
    },
    {
      id: "tile-backer-board",
      label: "Tile Backer Board",
      aliases: ["tile backer board", "cement backer board", "backer board"],
      positiveTerms: ["tile backer board", "cement backer board", "tile board"],
      negativeTerms: ["drywall board", "foam board insulation"],
    },
    {
      id: "tile-trim",
      label: "Tile Trim",
      aliases: ["tile trim", "tile edge trim", "schluter trim"],
      positiveTerms: ["tile trim", "tile edge trim", "schluter trim"],
      negativeTerms: ["window trim", "baseboard trim"],
    },
  ],
  brands: [
    { id: "daltile", label: "Daltile", aliases: ["daltile"] },
    { id: "schluter", label: "Schluter", aliases: ["schluter", "schluter systems"] },
    { id: "mapei", label: "MAPEI", aliases: ["mapei"] },
  ],
  ambiguousTerms: ["tile", "grout", "trim"],
};

