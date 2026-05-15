import type { ConstructionOntologyCategory } from "../types";

export const plumbingOntologyCategory: ConstructionOntologyCategory = {
  categoryId: "plumbing",
  label: "Plumbing",
  coverageLevel: "baseline",
  productTypes: [
    {
      id: "copper-pipe",
      label: "Copper Pipe",
      aliases: ["copper pipe", "copper tubing", "type l copper", "type m copper"],
      positiveTerms: ["copper", "pipe", "tube", "tubing"],
      negativeTerms: ["electrical wire", "romex"],
    },
    {
      id: "pvc-pipe",
      label: "PVC Pipe",
      aliases: ["pvc pipe", "schedule 40 pvc", "schedule 80 pvc"],
      positiveTerms: ["pvc", "pipe", "schedule 40", "schedule 80"],
      negativeTerms: ["conduit body", "breaker"],
    },
    {
      id: "pex-tubing",
      label: "PEX Tubing",
      aliases: ["pex tubing", "pex pipe", "pex-a", "pex-b"],
      positiveTerms: ["pex", "tubing", "pipe"],
      negativeTerms: ["drywall", "joint compound"],
    },
    {
      id: "fittings",
      label: "Fittings",
      aliases: [
        "plumbing fittings",
        "pvc fittings",
        "copper fittings",
        "pex fittings",
        "pipe coupling",
        "pipe adapter",
        "plumbing elbow",
        "plumbing tee",
      ],
      positiveTerms: [
        "plumbing fitting",
        "pvc fitting",
        "copper fitting",
        "pex fitting",
        "pipe coupling",
        "pipe adapter",
        "plumbing elbow",
        "plumbing tee",
      ],
      negativeTerms: ["breaker", "panel"],
    },
    {
      id: "valves",
      label: "Valves",
      aliases: ["ball valve", "gate valve", "check valve", "shutoff valve"],
      positiveTerms: ["valve", "shutoff", "ball valve", "gate valve"],
      negativeTerms: ["light switch", "receptacle"],
    },
  ],
  brands: [
    { id: "charlotte-pipe", label: "Charlotte Pipe", aliases: ["charlotte pipe"] },
    { id: "uponor", label: "Uponor", aliases: ["uponor", "wirsbo"] },
    { id: "sharkbite", label: "SharkBite", aliases: ["sharkbite"] },
  ],
  ambiguousTerms: ["pipe", "fitting", "adapter"],
};

