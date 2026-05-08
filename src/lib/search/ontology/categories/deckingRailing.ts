import type { ConstructionOntologyCategory } from "../types";

export const deckingRailingOntologyCategory: ConstructionOntologyCategory = {
  categoryId: "decking_railing",
  label: "Decking & Railing",
  coverageLevel: "baseline",
  productTypes: [
    {
      id: "composite-decking",
      label: "Composite Decking",
      aliases: ["composite decking", "composite deck boards", "capped composite decking"],
      positiveTerms: ["composite decking", "composite deck boards", "capped composite"],
      negativeTerms: ["composite shims", "composite siding"],
    },
    {
      id: "wood-decking",
      label: "Wood Decking",
      aliases: ["wood decking", "pressure treated deck boards", "cedar decking"],
      positiveTerms: ["wood decking", "treated deck boards", "cedar decking"],
      negativeTerms: ["wood fence pickets", "framing lumber studs"],
    },
    {
      id: "deck-boards",
      label: "Deck Boards",
      aliases: ["deck boards", "grooved deck boards", "decking boards"],
      positiveTerms: ["deck boards", "grooved deck boards", "decking boards"],
      negativeTerms: ["drywall board", "cement board"],
    },
    {
      id: "deck-railing",
      label: "Deck Railing",
      aliases: ["deck railing", "composite railing", "aluminum deck railing"],
      positiveTerms: ["deck railing", "composite railing", "aluminum deck railing"],
      negativeTerms: ["stair handrail only", "pipe railing fittings"],
    },
    {
      id: "deck-fasteners",
      label: "Deck Fasteners",
      aliases: ["deck screws", "hidden deck fasteners", "deck clips"],
      positiveTerms: ["deck screws", "hidden deck fasteners", "deck clips"],
      negativeTerms: ["roofing nails", "drywall screws"],
    },
    {
      id: "joist-tape",
      label: "Joist Tape",
      aliases: ["joist tape", "deck joist tape", "butyl joist tape"],
      positiveTerms: ["joist tape", "deck joist tape", "butyl joist tape"],
      negativeTerms: ["drywall tape", "electrical tape"],
    },
    {
      id: "stair-stringers",
      label: "Stair Stringers",
      aliases: ["deck stair stringers", "stair stringers", "metal stair stringers"],
      positiveTerms: ["deck stair stringers", "stair stringers", "metal stair stringers"],
      negativeTerms: ["stringer board only", "trim stair nose"],
    },
  ],
  brands: [
    { id: "trex", label: "Trex", aliases: ["trex"] },
    { id: "timbertech", label: "TimberTech", aliases: ["timbertech", "azek decking"] },
    { id: "fastenmaster", label: "FastenMaster", aliases: ["fastenmaster"] },
  ],
  ambiguousTerms: ["deck boards", "railing", "stringers"],
};

