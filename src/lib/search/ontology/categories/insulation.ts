import type { ConstructionOntologyCategory } from "../types";

export const insulationOntologyCategory: ConstructionOntologyCategory = {
  categoryId: "insulation",
  label: "Insulation",
  coverageLevel: "baseline",
  productTypes: [
    {
      id: "batt-insulation",
      label: "Batt Insulation",
      aliases: ["batt insulation", "fiberglass batt", "kraft faced batt"],
      positiveTerms: ["batt insulation", "fiberglass batt", "kraft faced"],
      negativeTerms: ["blanket drop cloth", "moving blanket"],
    },
    {
      id: "blown-insulation",
      label: "Blown Insulation",
      aliases: ["blown insulation", "blown in insulation", "cellulose insulation"],
      positiveTerms: ["blown insulation", "blown in", "cellulose insulation"],
      negativeTerms: ["air blower", "leaf blower"],
    },
    {
      id: "spray-foam",
      label: "Spray Foam",
      aliases: ["spray foam insulation", "closed cell spray foam", "open cell spray foam"],
      positiveTerms: ["spray foam insulation", "closed cell", "open cell"],
      negativeTerms: ["expanding foam sealant", "spray paint"],
    },
    {
      id: "rigid-insulation",
      label: "Rigid Insulation",
      aliases: ["rigid insulation", "foam board insulation", "polyiso board", "xps insulation"],
      positiveTerms: ["rigid insulation", "foam board insulation", "polyiso", "xps insulation"],
      negativeTerms: ["drywall board", "cement board"],
    },
    {
      id: "mineral-wool",
      label: "Mineral Wool",
      aliases: ["mineral wool insulation", "rockwool insulation", "stone wool insulation"],
      positiveTerms: ["mineral wool", "rockwool", "stone wool"],
      negativeTerms: ["wool blanket", "felt pad"],
    },
    {
      id: "radiant-barrier",
      label: "Radiant Barrier",
      aliases: ["radiant barrier", "foil insulation", "radiant barrier foil"],
      positiveTerms: ["radiant barrier", "foil insulation", "barrier foil"],
      negativeTerms: ["foil tape", "foil pan"],
    },
  ],
  brands: [
    { id: "owens-corning-insulation", label: "Owens Corning", aliases: ["owens corning insulation", "pink panther insulation"] },
    { id: "johns-manville", label: "Johns Manville", aliases: ["johns manville", "jm insulation"] },
    { id: "rockwool", label: "ROCKWOOL", aliases: ["rockwool"] },
    { id: "knauf", label: "Knauf", aliases: ["knauf insulation", "knauf"] },
  ],
  ambiguousTerms: ["insulation", "foam", "barrier"],
};

