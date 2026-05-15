import type { ConstructionOntologyCategory } from "../types";

export const flooringOntologyCategory: ConstructionOntologyCategory = {
  categoryId: "flooring",
  label: "Flooring",
  coverageLevel: "baseline",
  productTypes: [
    {
      id: "hardwood-flooring",
      label: "Hardwood Flooring",
      aliases: ["hardwood flooring", "engineered hardwood", "solid hardwood flooring"],
      positiveTerms: ["hardwood flooring", "engineered hardwood", "solid hardwood"],
      negativeTerms: ["hardwood plywood", "wood trim"],
    },
    {
      id: "laminate-flooring",
      label: "Laminate Flooring",
      aliases: ["laminate flooring", "laminate floor planks", "floating laminate floor"],
      positiveTerms: ["laminate flooring", "laminate planks", "floating laminate"],
      negativeTerms: ["laminate countertop", "plastic laminate sheet"],
    },
    {
      id: "vinyl-plank-flooring",
      label: "Vinyl Plank Flooring",
      aliases: ["vinyl plank flooring", "luxury vinyl plank", "lvp flooring", "spc flooring"],
      positiveTerms: ["vinyl plank flooring", "luxury vinyl plank", "lvp flooring", "spc flooring"],
      negativeTerms: ["vinyl siding", "vinyl window"],
    },
    {
      id: "carpet",
      label: "Carpet",
      aliases: ["carpet", "carpet tile", "broadloom carpet"],
      positiveTerms: ["carpet", "carpet tile", "broadloom carpet"],
      negativeTerms: ["tile underlayment", "rubber mat"],
    },
    {
      id: "floor-underlayment",
      label: "Underlayment",
      aliases: ["floor underlayment", "sound underlayment", "underlayment pad"],
      positiveTerms: ["floor underlayment", "underlayment pad", "sound underlayment"],
      negativeTerms: ["roof underlayment", "house wrap"],
    },
    {
      id: "floor-adhesive",
      label: "Floor Adhesive",
      aliases: ["floor adhesive", "vinyl flooring adhesive", "wood flooring adhesive"],
      positiveTerms: ["floor adhesive", "flooring adhesive", "vinyl flooring adhesive"],
      negativeTerms: ["tile mortar", "construction adhesive"],
    },
    {
      id: "transition-strips",
      label: "Transition Strips",
      aliases: ["floor transition strip", "t-molding transition", "reducer strip"],
      positiveTerms: ["transition strip", "t-molding", "reducer strip"],
      negativeTerms: ["curtain rod", "metal angle"],
    },
  ],
  brands: [
    { id: "shaw-floors", label: "Shaw Floors", aliases: ["shaw floors", "shaw flooring"] },
    { id: "mohawk", label: "Mohawk", aliases: ["mohawk flooring", "mohawk"] },
    { id: "pergo", label: "Pergo", aliases: ["pergo"] },
  ],
  ambiguousTerms: ["plank", "underlayment", "transition"],
};

