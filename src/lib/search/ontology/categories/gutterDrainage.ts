import type { ConstructionOntologyCategory } from "../types";

export const gutterDrainageOntologyCategory: ConstructionOntologyCategory = {
  categoryId: "gutter_drainage",
  label: "Gutter & Drainage",
  coverageLevel: "baseline",
  productTypes: [
    {
      id: "gutters",
      label: "Gutters",
      aliases: ["seamless gutters", "k-style gutters", "half-round gutters"],
      positiveTerms: ["seamless gutters", "k-style gutters", "half-round gutters"],
      negativeTerms: ["gutter cleaner tool", "roof rake"],
    },
    {
      id: "downspouts",
      label: "Downspouts",
      aliases: ["downspouts", "aluminum downspouts", "rectangular downspouts"],
      positiveTerms: ["downspouts", "aluminum downspouts", "rectangular downspouts"],
      negativeTerms: ["drain vent pipe", "conduit drop"],
    },
    {
      id: "gutter-guards",
      label: "Gutter Guards",
      aliases: ["gutter guards", "leaf guards for gutters", "gutter covers"],
      positiveTerms: ["gutter guards", "leaf guards", "gutter covers"],
      negativeTerms: ["safety guard rails", "window guards"],
    },
    {
      id: "drainage-pipe",
      label: "Drainage Pipe",
      aliases: ["drainage pipe", "corrugated drain pipe", "solid drain pipe"],
      positiveTerms: ["drainage pipe", "corrugated drain pipe", "solid drain pipe"],
      negativeTerms: ["electrical conduit", "pressure pvc plumbing"],
    },
    {
      id: "catch-basins",
      label: "Catch Basins",
      aliases: ["catch basins", "yard catch basin", "storm drain basin"],
      positiveTerms: ["catch basins", "yard catch basin", "storm drain basin"],
      negativeTerms: ["sink basin", "wash basin"],
    },
    {
      id: "channel-drains",
      label: "Channel Drains",
      aliases: ["channel drain", "trench drain", "linear drain channel"],
      positiveTerms: ["channel drain", "trench drain", "linear drain channel"],
      negativeTerms: ["shower linear drain only", "floor register"],
    },
    {
      id: "french-drain-supplies",
      label: "French Drain Supplies",
      aliases: ["french drain supplies", "french drain pipe", "french drain fabric"],
      positiveTerms: ["french drain supplies", "french drain pipe", "french drain fabric"],
      negativeTerms: ["landscape fabric only", "drip irrigation tubing"],
    },
  ],
  brands: [
    { id: "amerimax", label: "Amerimax", aliases: ["amerimax"] },
    { id: "nds", label: "NDS", aliases: ["nds drainage", "nds drain", "nds channel drain"] },
    { id: "ads", label: "ADS", aliases: ["advanced drainage systems", "ads pipe"] },
  ],
  ambiguousTerms: ["drainage", "drain", "guards"],
};

