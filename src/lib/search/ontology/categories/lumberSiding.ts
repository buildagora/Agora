import type { ConstructionOntologyCategory } from "../types";

export const lumberSidingOntologyCategory: ConstructionOntologyCategory = {
  categoryId: "lumber_siding",
  label: "Lumber & Siding",
  coverageLevel: "baseline",
  productTypes: [
    {
      id: "framing-lumber",
      label: "Framing Lumber",
      aliases: ["framing lumber", "2x4 lumber", "2x6 lumber", "stud lumber"],
      positiveTerms: ["framing lumber", "2x4", "2x6", "stud lumber"],
      negativeTerms: ["steel studs", "drywall studs"],
    },
    {
      id: "treated-lumber",
      label: "Treated Lumber",
      aliases: ["treated lumber", "pressure treated lumber", "pt lumber"],
      positiveTerms: ["pressure treated", "treated lumber", "pt lumber"],
      negativeTerms: ["untreated pine", "mdf trim"],
    },
    {
      id: "plywood",
      label: "Plywood",
      aliases: ["plywood", "cdx plywood", "sheathing plywood"],
      positiveTerms: ["plywood", "cdx", "sheathing plywood"],
      negativeTerms: ["osb sheathing", "drywall board"],
    },
    {
      id: "osb",
      label: "OSB",
      aliases: ["osb", "osb sheathing", "oriented strand board"],
      positiveTerms: ["osb", "oriented strand board", "osb sheathing"],
      negativeTerms: ["plywood", "cement board"],
    },
    {
      id: "fiber-cement-siding",
      label: "Fiber Cement Siding",
      aliases: ["fiber cement siding", "hardie board siding", "james hardie siding"],
      positiveTerms: ["fiber cement siding", "hardie board", "lap siding"],
      negativeTerms: ["cement mix", "drywall panel"],
    },
    {
      id: "vinyl-siding",
      label: "Vinyl Siding",
      aliases: ["vinyl siding", "vinyl lap siding", "vinyl shake siding"],
      positiveTerms: ["vinyl siding", "lap siding", "vinyl shake"],
      negativeTerms: ["vinyl flooring", "siding nailer gun"],
    },
    {
      id: "house-wrap",
      label: "House Wrap",
      aliases: ["house wrap", "weather resistant barrier", "wrb wrap"],
      positiveTerms: ["house wrap", "weather resistant barrier", "wrb"],
      negativeTerms: ["roof underlayment", "plastic sheeting"],
    },
  ],
  brands: [
    { id: "james-hardie", label: "James Hardie", aliases: ["james hardie", "hardie"] },
    { id: "lp", label: "LP", aliases: ["lp smartside", "louisiana pacific"] },
    { id: "tyvek", label: "Tyvek", aliases: ["tyvek", "dupont tyvek"] },
    { id: "zip-system", label: "ZIP System", aliases: ["zip system", "huber zip"] },
  ],
  ambiguousTerms: ["siding", "sheathing", "wrap"],
};

