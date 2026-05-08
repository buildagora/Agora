import type { ConstructionOntologyCategory } from "../types";

export const roofingOntologyCategory: ConstructionOntologyCategory = {
  categoryId: "roofing",
  label: "Roofing",
  coverageLevel: "baseline",
  productTypes: [
    {
      id: "asphalt-shingles",
      label: "Asphalt Shingles",
      aliases: [
        "asphalt shingles",
        "architectural shingles",
        "dimensional shingles",
        "laminate shingles",
        "3-tab shingles",
      ],
      positiveTerms: ["asphalt shingles", "architectural shingles", "dimensional shingles", "roof shingles"],
      negativeTerms: ["drywall panel", "electrical panel"],
    },
    {
      id: "metal-roofing",
      label: "Metal Roofing",
      aliases: [
        "metal roofing",
        "standing seam roofing",
        "corrugated metal roofing",
        "r-panel roofing",
        "metal roof panels",
      ],
      positiveTerms: ["standing seam", "corrugated roofing", "r-panel", "roof panels"],
      negativeTerms: ["metal studs", "sheet metal duct"],
    },
    {
      id: "roofing-accessories",
      label: "Roofing Accessories",
      aliases: ["roofing accessories", "roof accessories", "starter strip", "hip and ridge"],
      positiveTerms: ["starter strip", "hip and ridge", "ridge cap", "pipe boot"],
      negativeTerms: ["door flashing kit", "window flashing tape"],
    },
    {
      id: "underlayment",
      label: "Underlayment",
      aliases: ["roof underlayment", "synthetic underlayment", "felt paper", "ice and water shield"],
      positiveTerms: ["underlayment", "synthetic underlayment", "felt paper", "ice and water shield"],
      negativeTerms: ["house wrap", "drywall tape"],
    },
    {
      id: "ridge-vent",
      label: "Ridge Vent",
      aliases: ["ridge vent", "shingle over ridge vent", "roof ridge vent"],
      positiveTerms: ["ridge vent", "roof ridge vent", "shingle over vent"],
      negativeTerms: ["bath fan vent", "dryer vent"],
    },
    {
      id: "flashing",
      label: "Flashing",
      aliases: ["roof flashing", "step flashing", "valley flashing", "chimney flashing"],
      positiveTerms: ["step flashing", "valley flashing", "chimney flashing", "roof flashing"],
      negativeTerms: ["conduit fitting", "electrical box"],
    },
    {
      id: "drip-edge",
      label: "Drip Edge",
      aliases: ["drip edge", "roof drip edge", "drip edge flashing"],
      positiveTerms: ["drip edge", "roof edge flashing", "eave edge"],
      negativeTerms: ["metal angle", "corner bead"],
    },
  ],
  brands: [
    { id: "gaf", label: "GAF", aliases: ["gaf", "timberline", "timberline hdz"] },
    { id: "certainteed", label: "CertainTeed", aliases: ["certainteed", "landmark shingles", "landmark pro"] },
    { id: "owens-corning", label: "Owens Corning", aliases: ["owens corning", "duration shingles", "oakridge shingles"] },
    { id: "tamko", label: "TAMKO", aliases: ["tamko", "heritage shingles"] },
    { id: "iko", label: "IKO", aliases: ["iko", "cambridge shingles", "dynasty shingles"] },
    { id: "atlas", label: "Atlas", aliases: ["atlas", "pinnacle pristine", "stormmaster"] },
  ],
  ambiguousTerms: ["shingles", "flashing", "underlayment"],
};

