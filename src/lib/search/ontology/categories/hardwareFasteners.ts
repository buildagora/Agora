import type { ConstructionOntologyCategory } from "../types";

export const hardwareFastenersOntologyCategory: ConstructionOntologyCategory = {
  categoryId: "hardware_fasteners",
  label: "Hardware & Fasteners",
  coverageLevel: "baseline",
  productTypes: [
    {
      id: "screws",
      label: "Screws",
      aliases: ["construction screws", "deck screws", "wood screws", "self tapping screws"],
      positiveTerms: ["construction screws", "deck screws", "wood screws", "self tapping screws"],
      negativeTerms: ["screwdriver bit", "auger screw"],
    },
    {
      id: "nails",
      label: "Nails",
      aliases: ["framing nails", "roofing nails", "finish nails", "concrete nails"],
      positiveTerms: ["framing nails", "roofing nails", "finish nails", "concrete nails"],
      negativeTerms: ["nail gun", "nail polish"],
    },
    {
      id: "bolts",
      label: "Bolts",
      aliases: ["hex bolts", "carriage bolts", "anchor bolts", "lag bolts"],
      positiveTerms: ["hex bolts", "carriage bolts", "anchor bolts", "lag bolts"],
      negativeTerms: ["bolt cutter", "lightning bolt"],
    },
    {
      id: "washers",
      label: "Washers",
      aliases: ["flat washers", "lock washers", "fender washers"],
      positiveTerms: ["flat washers", "lock washers", "fender washers"],
      negativeTerms: ["pressure washer", "wash machine"],
    },
    {
      id: "anchors",
      label: "Anchors",
      aliases: ["concrete anchors", "wedge anchors", "drywall anchors", "sleeve anchors"],
      positiveTerms: ["concrete anchors", "wedge anchors", "drywall anchors", "sleeve anchors"],
      negativeTerms: ["boat anchor", "anchor rope"],
    },
    {
      id: "nuts",
      label: "Nuts",
      aliases: ["hex nuts", "lock nuts", "nylon insert lock nuts"],
      positiveTerms: ["hex nuts", "lock nuts", "nylon insert lock nuts"],
      negativeTerms: ["nut driver", "peanut"],
    },
    {
      id: "structural-connectors",
      label: "Structural Connectors",
      aliases: ["joist hangers", "hurricane ties", "post bases", "framing connectors"],
      positiveTerms: ["joist hangers", "hurricane ties", "post bases", "framing connectors"],
      negativeTerms: ["electrical connectors", "hose connector"],
    },
  ],
  brands: [
    { id: "simpson-strong-tie-fasteners", label: "Simpson Strong-Tie", aliases: ["simpson strong-tie", "simpson strong tie"] },
    { id: "grk", label: "GRK", aliases: ["grk screws", "grk"] },
    { id: "tapcon", label: "Tapcon", aliases: ["tapcon"] },
  ],
  ambiguousTerms: ["anchor", "connector", "screws"],
};

