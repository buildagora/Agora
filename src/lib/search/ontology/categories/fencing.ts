import type { ConstructionOntologyCategory } from "../types";

export const fencingOntologyCategory: ConstructionOntologyCategory = {
  categoryId: "fencing",
  label: "Fencing",
  coverageLevel: "baseline",
  productTypes: [
    {
      id: "wood-fencing",
      label: "Wood Fencing",
      aliases: ["wood fence panels", "cedar fence panels", "pressure treated fence"],
      positiveTerms: ["wood fence panels", "cedar fence", "treated wood fence"],
      negativeTerms: ["wood decking", "lumber studs"],
    },
    {
      id: "vinyl-fencing",
      label: "Vinyl Fencing",
      aliases: ["vinyl fence panels", "privacy vinyl fence", "vinyl picket fence"],
      positiveTerms: ["vinyl fence panels", "privacy vinyl fence", "vinyl picket fence"],
      negativeTerms: ["vinyl siding", "vinyl flooring"],
    },
    {
      id: "chain-link-fencing",
      label: "Chain Link Fencing",
      aliases: ["chain link fence", "chain link fabric", "galvanized chain link"],
      positiveTerms: ["chain link fence", "chain link fabric", "galvanized chain link"],
      negativeTerms: ["wire mesh concrete", "expanded metal"],
    },
    {
      id: "fence-posts",
      label: "Fence Posts",
      aliases: ["fence posts", "metal fence posts", "wood fence posts"],
      positiveTerms: ["fence posts", "metal fence posts", "wood fence posts"],
      negativeTerms: ["deck posts", "sign posts"],
    },
    {
      id: "gates",
      label: "Gates",
      aliases: ["fence gate", "vinyl fence gate", "chain link gate"],
      positiveTerms: ["fence gate", "vinyl fence gate", "chain link gate"],
      negativeTerms: ["garage door", "gate valve"],
    },
    {
      id: "fence-pickets",
      label: "Fence Pickets",
      aliases: ["fence pickets", "cedar pickets", "dog ear pickets"],
      positiveTerms: ["fence pickets", "cedar pickets", "dog ear pickets"],
      negativeTerms: ["paint picket", "trim board"],
    },
    {
      id: "fence-hardware",
      label: "Fence Hardware",
      aliases: ["fence hinges", "fence latch", "fence brackets", "gate hardware"],
      positiveTerms: ["fence hinges", "fence latch", "fence brackets", "gate hardware"],
      negativeTerms: ["door hardware", "cabinet hinges"],
    },
  ],
  brands: [
    { id: "master-halco", label: "Master Halco", aliases: ["master halco"] },
    { id: "barrette-outdoor", label: "Barrette Outdoor Living", aliases: ["barrette outdoor", "barrette"] },
    { id: "freedom-fence", label: "Freedom", aliases: ["freedom fencing", "freedom fence"] },
  ],
  ambiguousTerms: ["gate", "posts", "hardware"],
};

