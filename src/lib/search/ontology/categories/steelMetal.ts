import type { ConstructionOntologyCategory } from "../types";

export const steelMetalOntologyCategory: ConstructionOntologyCategory = {
  categoryId: "steel_metal",
  label: "Steel & Metal",
  coverageLevel: "baseline",
  productTypes: [
    {
      id: "steel-studs",
      label: "Steel Studs",
      aliases: ["steel studs", "metal studs", "light gauge steel studs"],
      positiveTerms: ["steel studs", "metal studs", "light gauge studs"],
      negativeTerms: ["wood studs", "track lighting"],
    },
    {
      id: "metal-framing",
      label: "Metal Framing",
      aliases: ["metal framing", "steel framing track", "framing track"],
      positiveTerms: ["metal framing", "steel framing", "framing track"],
      negativeTerms: ["picture frame", "wood framing"],
    },
    {
      id: "angle-iron",
      label: "Angle Iron",
      aliases: ["angle iron", "steel angle", "angle steel"],
      positiveTerms: ["angle iron", "steel angle", "angle steel"],
      negativeTerms: ["corner bead", "trim angle"],
    },
    {
      id: "sheet-metal",
      label: "Sheet Metal",
      aliases: ["sheet metal", "galvanized sheet metal", "cold rolled sheet"],
      positiveTerms: ["sheet metal", "galvanized sheet", "cold rolled sheet"],
      negativeTerms: ["roofing shingles", "drywall sheet"],
    },
    {
      id: "expanded-metal",
      label: "Expanded Metal",
      aliases: ["expanded metal", "expanded steel mesh", "expanded metal lath"],
      positiveTerms: ["expanded metal", "expanded steel", "metal lath"],
      negativeTerms: ["wire mesh concrete", "window screen mesh"],
    },
    {
      id: "rebar-mesh",
      label: "Rebar Mesh",
      aliases: ["rebar mesh", "steel reinforcement mesh", "welded rebar mesh"],
      positiveTerms: ["rebar mesh", "reinforcement mesh", "welded rebar"],
      negativeTerms: ["fiberglass mesh tape", "plastic mesh"],
    },
  ],
  brands: [
    { id: "clarkdietrich", label: "ClarkDietrich", aliases: ["clarkdietrich", "clark dietrich"] },
    { id: "marino-ware", label: "Marino Ware", aliases: ["marino ware", "marino"] },
    { id: "simpson-strong-tie-metal", label: "Simpson Strong-Tie", aliases: ["simpson strong-tie", "simpson steel"] },
  ],
  ambiguousTerms: ["studs", "framing", "mesh"],
};

