import type { ConstructionOntologyCategory } from "../types";

export const concreteCementOntologyCategory: ConstructionOntologyCategory = {
  categoryId: "concrete_cement",
  label: "Concrete & Cement",
  coverageLevel: "baseline",
  productTypes: [
    {
      id: "concrete-mix",
      label: "Concrete Mix",
      aliases: ["concrete mix", "ready mix concrete", "sakrete concrete mix", "quikrete concrete mix"],
      positiveTerms: ["concrete mix", "ready mix", "bagged concrete"],
      negativeTerms: ["joint compound", "thinset mortar"],
    },
    {
      id: "cement",
      label: "Cement",
      aliases: ["portland cement", "masonry cement", "hydraulic cement"],
      positiveTerms: ["portland cement", "masonry cement", "hydraulic cement"],
      negativeTerms: ["cement board siding", "fiber cement siding"],
    },
    {
      id: "mortar",
      label: "Mortar",
      aliases: ["mortar mix", "type s mortar", "type n mortar"],
      positiveTerms: ["mortar mix", "type s mortar", "type n mortar", "masonry mortar"],
      negativeTerms: ["tile grout", "joint compound"],
    },
    {
      id: "rebar",
      label: "Rebar",
      aliases: ["rebar", "reinforcing bar", "steel rebar"],
      positiveTerms: ["rebar", "reinforcing bar", "steel rebar"],
      negativeTerms: ["wire shelf", "conduit"],
    },
    {
      id: "wire-mesh",
      label: "Wire Mesh",
      aliases: ["concrete wire mesh", "welded wire mesh", "remesh"],
      positiveTerms: ["wire mesh", "welded wire", "remesh", "reinforcement mesh"],
      negativeTerms: ["expanded metal lath", "window screen"],
    },
    {
      id: "forms",
      label: "Forms",
      aliases: ["concrete forms", "form boards", "form ties"],
      positiveTerms: ["concrete forms", "form ties", "form board"],
      negativeTerms: ["tax form", "registration form"],
    },
    {
      id: "expansion-joint",
      label: "Expansion Joint",
      aliases: ["expansion joint", "concrete expansion joint", "joint filler"],
      positiveTerms: ["expansion joint", "joint filler", "control joint"],
      negativeTerms: ["drywall joint tape", "caulk joint"],
    },
  ],
  brands: [
    { id: "quikrete", label: "QUIKRETE", aliases: ["quikrete"] },
    { id: "sakrete", label: "Sakrete", aliases: ["sakrete"] },
    { id: "simpson-strong-tie", label: "Simpson Strong-Tie", aliases: ["simpson strong-tie", "simpson"] },
  ],
  ambiguousTerms: ["cement", "joint", "mesh"],
};

