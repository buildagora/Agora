import type { ConstructionOntologyCategory } from "../types";

export const windowsDoorsOntologyCategory: ConstructionOntologyCategory = {
  categoryId: "windows_doors",
  label: "Windows & Doors",
  coverageLevel: "baseline",
  productTypes: [
    {
      id: "windows",
      label: "Windows",
      aliases: ["replacement windows", "vinyl windows", "double hung window", "casement window"],
      positiveTerms: ["replacement windows", "double hung window", "casement window", "vinyl windows"],
      negativeTerms: ["window film", "window screen mesh"],
    },
    {
      id: "entry-doors",
      label: "Entry Doors",
      aliases: ["entry door", "front door", "exterior entry door"],
      positiveTerms: ["entry door", "front door", "exterior entry door"],
      negativeTerms: ["screen door closer", "door weatherstrip"],
    },
    {
      id: "interior-doors",
      label: "Interior Doors",
      aliases: ["interior door", "prehung interior door", "hollow core door"],
      positiveTerms: ["interior door", "prehung interior door", "hollow core door"],
      negativeTerms: ["cabinet door", "access panel door"],
    },
    {
      id: "patio-doors",
      label: "Patio Doors",
      aliases: ["patio door", "sliding patio door", "french patio door"],
      positiveTerms: ["patio door", "sliding patio door", "french patio door"],
      negativeTerms: ["garage entry door", "storm door"],
    },
    {
      id: "garage-doors",
      label: "Garage Doors",
      aliases: ["garage door", "sectional garage door", "insulated garage door"],
      positiveTerms: ["garage door", "sectional garage door", "insulated garage door"],
      negativeTerms: ["roll-up sheet door", "barn door track"],
    },
    {
      id: "skylights",
      label: "Skylights",
      aliases: ["skylight", "fixed skylight", "vented skylight"],
      positiveTerms: ["skylight", "fixed skylight", "vented skylight"],
      negativeTerms: ["roof vent", "solar tube light"],
    },
    {
      id: "door-hardware",
      label: "Door Hardware",
      aliases: ["door lockset", "door handle set", "deadbolt", "door hinge"],
      positiveTerms: ["door lockset", "deadbolt", "door hinge", "door handle set"],
      negativeTerms: ["cabinet hinge", "gate latch"],
    },
  ],
  brands: [
    { id: "andersen", label: "Andersen", aliases: ["andersen windows", "andersen"] },
    { id: "pella", label: "Pella", aliases: ["pella"] },
    { id: "jeld-wen", label: "JELD-WEN", aliases: ["jeld-wen", "jeld wen"] },
  ],
  ambiguousTerms: ["door", "window", "hardware"],
};

