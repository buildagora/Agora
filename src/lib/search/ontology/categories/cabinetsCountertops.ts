import type { ConstructionOntologyCategory } from "../types";

export const cabinetsCountertopsOntologyCategory: ConstructionOntologyCategory = {
  categoryId: "cabinets_countertops",
  label: "Cabinets & Countertops",
  coverageLevel: "baseline",
  productTypes: [
    {
      id: "kitchen-cabinets",
      label: "Kitchen Cabinets",
      aliases: ["kitchen cabinets", "base cabinets", "wall cabinets"],
      positiveTerms: ["kitchen cabinets", "base cabinets", "wall cabinets"],
      negativeTerms: ["cabinet screws", "tool chest cabinet"],
    },
    {
      id: "bathroom-vanities",
      label: "Bathroom Vanities",
      aliases: ["bathroom vanity", "bath vanity cabinet", "single sink vanity"],
      positiveTerms: ["bathroom vanity", "bath vanity cabinet", "single sink vanity"],
      negativeTerms: ["laundry sink cabinet", "medicine cabinet"],
    },
    {
      id: "cabinet-hardware",
      label: "Cabinet Hardware",
      aliases: ["cabinet knobs", "cabinet pulls", "cabinet hinges", "drawer slides"],
      positiveTerms: ["cabinet knobs", "cabinet pulls", "cabinet hinges", "drawer slides"],
      negativeTerms: ["door lockset", "gate hardware"],
    },
    {
      id: "laminate-countertops",
      label: "Laminate Countertops",
      aliases: ["laminate countertop", "postform countertop", "laminate counter top"],
      positiveTerms: ["laminate countertop", "postform countertop", "laminate counter top"],
      negativeTerms: ["laminate flooring", "plastic laminate sheet"],
    },
    {
      id: "quartz-countertops",
      label: "Quartz Countertops",
      aliases: ["quartz countertop", "engineered quartz countertop", "quartz slab"],
      positiveTerms: ["quartz countertop", "engineered quartz", "quartz slab"],
      negativeTerms: ["quartz tile", "quartz clock movement"],
    },
    {
      id: "granite-countertops",
      label: "Granite Countertops",
      aliases: ["granite countertop", "granite slab countertop", "prefab granite top"],
      positiveTerms: ["granite countertop", "granite slab", "prefab granite top"],
      negativeTerms: ["granite gravel", "stone veneer"],
    },
    {
      id: "butcher-block-countertops",
      label: "Butcher Block Countertops",
      aliases: ["butcher block countertop", "wood countertop", "butcher block island top"],
      positiveTerms: ["butcher block countertop", "wood countertop", "butcher block top"],
      negativeTerms: ["cutting board", "wood flooring plank"],
    },
  ],
  brands: [
    { id: "kraftmaid", label: "KraftMaid", aliases: ["kraftmaid"] },
    { id: "merillat", label: "Merillat", aliases: ["merillat"] },
    { id: "caesarstone", label: "Caesarstone", aliases: ["caesarstone"] },
  ],
  ambiguousTerms: ["cabinet", "countertop", "hardware"],
};

