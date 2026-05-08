import type { ConstructionOntologyCategory } from "../types";

export const brickOntologyCategory: ConstructionOntologyCategory = {
  categoryId: "brick",
  label: "Brick & Masonry",
  coverageLevel: "baseline",
  productTypes: [
    {
      id: "brick",
      label: "Brick",
      aliases: ["face brick", "clay brick", "modular brick"],
      positiveTerms: ["face brick", "clay brick", "modular brick"],
      negativeTerms: ["brick veneer panel only", "brick wallpaper"],
    },
    {
      id: "concrete-block",
      label: "Concrete Block",
      aliases: ["concrete block", "cmu block", "concrete masonry unit"],
      positiveTerms: ["concrete block", "cmu block", "masonry unit"],
      negativeTerms: ["retaining wall block kit", "foam block"],
    },
    {
      id: "stone-veneer",
      label: "Stone Veneer",
      aliases: ["stone veneer", "manufactured stone veneer", "masonry veneer stone"],
      positiveTerms: ["stone veneer", "manufactured stone veneer", "masonry veneer stone"],
      negativeTerms: ["veneer plywood", "decorative stone bag"],
    },
    {
      id: "mortar",
      label: "Mortar",
      aliases: ["masonry mortar", "type s mortar", "type n mortar"],
      positiveTerms: ["masonry mortar", "type s mortar", "type n mortar"],
      negativeTerms: ["thinset mortar", "joint compound"],
    },
    {
      id: "masonry-sand",
      label: "Masonry Sand",
      aliases: ["masonry sand", "brick sand", "washed masonry sand"],
      positiveTerms: ["masonry sand", "brick sand", "washed masonry sand"],
      negativeTerms: ["play sand", "joint sand pavers"],
    },
    {
      id: "lintels",
      label: "Lintels",
      aliases: ["masonry lintel", "steel lintel", "angle lintel"],
      positiveTerms: ["masonry lintel", "steel lintel", "angle lintel"],
      negativeTerms: ["header lumber", "angle iron stock"],
    },
    {
      id: "masonry-ties",
      label: "Masonry Ties",
      aliases: ["masonry ties", "brick ties", "veneer ties"],
      positiveTerms: ["masonry ties", "brick ties", "veneer ties"],
      negativeTerms: ["hurricane ties wood framing", "cable ties"],
    },
  ],
  brands: [
    { id: "acme-brick", label: "Acme Brick", aliases: ["acme brick", "acme"] },
    { id: "wienerberger", label: "Wienerberger", aliases: ["wienerberger"] },
    { id: "specmix", label: "SPEC MIX", aliases: ["spec mix", "specmix"] },
  ],
  ambiguousTerms: ["brick", "mortar", "veneer"],
};

