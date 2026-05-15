import type { ConstructionOntologyCategory } from "../types";

export const toolsEquipmentOntologyCategory: ConstructionOntologyCategory = {
  categoryId: "tools_equipment",
  label: "Tools & Equipment",
  coverageLevel: "baseline",
  productTypes: [
    {
      id: "power-tools",
      label: "Power Tools",
      aliases: ["power tools", "cordless power tools", "corded power tools"],
      positiveTerms: ["power tools", "cordless tools", "corded tools"],
      negativeTerms: ["tool belt", "tool bag"],
    },
    {
      id: "hand-tools",
      label: "Hand Tools",
      aliases: ["hand tools", "construction hand tools", "mechanic hand tools"],
      positiveTerms: ["hand tools", "construction hand tools", "mechanic hand tools"],
      negativeTerms: ["power tool kit", "toolbox organizer"],
    },
    {
      id: "ladders",
      label: "Ladders",
      aliases: ["extension ladder", "step ladder", "multi-position ladder"],
      positiveTerms: ["extension ladder", "step ladder", "multi-position ladder"],
      negativeTerms: ["ladder rack", "attic stairs"],
    },
    {
      id: "generators",
      label: "Generators",
      aliases: ["portable generator", "inverter generator", "jobsite generator"],
      positiveTerms: ["portable generator", "inverter generator", "jobsite generator"],
      negativeTerms: ["generator cord", "battery charger"],
    },
    {
      id: "compressors",
      label: "Compressors",
      aliases: ["air compressor", "portable air compressor", "pancake compressor"],
      positiveTerms: ["air compressor", "portable compressor", "pancake compressor"],
      negativeTerms: ["hvac condenser", "compressor oil only"],
    },
    {
      id: "saw-blades",
      label: "Saw Blades",
      aliases: ["circular saw blade", "miter saw blade", "reciprocating saw blade"],
      positiveTerms: ["circular saw blade", "miter saw blade", "reciprocating blade"],
      negativeTerms: ["saw horse", "blade fuse"],
    },
    {
      id: "safety-equipment",
      label: "Safety Equipment",
      aliases: ["construction safety gear", "jobsite safety equipment", "ppe for construction"],
      positiveTerms: ["safety equipment", "jobsite safety", "construction ppe"],
      negativeTerms: ["safety yellow paint", "warning sign only"],
    },
  ],
  brands: [
    { id: "dewalt", label: "DEWALT", aliases: ["dewalt"] },
    { id: "milwaukee", label: "Milwaukee", aliases: ["milwaukee tools", "milwaukee"] },
    { id: "makita", label: "Makita", aliases: ["makita"] },
  ],
  ambiguousTerms: ["tools", "blade", "safety"],
};

