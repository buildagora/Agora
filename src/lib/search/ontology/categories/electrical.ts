import type { ConstructionOntologyCategory } from "../types";

export const electricalOntologyCategory: ConstructionOntologyCategory = {
  categoryId: "electrical",
  label: "Electrical",
  coverageLevel: "baseline",
  productTypes: [
    {
      id: "circuit-breakers",
      label: "Circuit Breakers",
      aliases: ["circuit breaker", "breaker", "20 amp breaker", "afci breaker", "gfci breaker"],
      positiveTerms: ["breaker", "amp", "afci", "gfci"],
      negativeTerms: ["shingle", "drywall tape"],
    },
    {
      id: "electrical-panels",
      label: "Electrical Panels",
      aliases: ["electrical panel", "load center", "panelboard", "breaker panel"],
      positiveTerms: ["panel", "load center", "panelboard"],
      negativeTerms: ["joint compound", "valve"],
    },
    {
      id: "wire",
      label: "Wire",
      aliases: ["electrical wire", "romex", "thhn", "mc cable"],
      positiveTerms: ["wire", "romex", "thhn", "cable"],
      negativeTerms: ["copper pipe", "pex"],
    },
    {
      id: "conduit",
      label: "Conduit",
      aliases: ["emt conduit", "pvc conduit", "rigid conduit"],
      positiveTerms: ["conduit", "emt", "rigid"],
      negativeTerms: ["drywall panel", "texture"],
    },
    {
      id: "boxes",
      label: "Boxes",
      aliases: ["electrical box", "junction box", "device box", "gang box"],
      positiveTerms: ["box", "junction", "device box", "gang"],
      negativeTerms: ["roof vent", "valve"],
    },
  ],
  brands: [
    { id: "square-d", label: "Square D", aliases: ["square d", "homeline", "qo"] },
    { id: "eaton", label: "Eaton", aliases: ["eaton", "cutler hammer"] },
    { id: "siemens", label: "Siemens", aliases: ["siemens", "murray"] },
  ],
  ambiguousTerms: ["panel", "box", "wire"],
};

