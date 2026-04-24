export type RoofingSubcategory = {
  id: string;
  label: string;
  aliases: string[];
};

export type RoofingBrand = {
  id: string;
  label: string;
  aliases: string[];
  subcategoryIds?: string[];
};

export const roofingSubcategories: RoofingSubcategory[] = [
  {
    id: "asphalt_shingles",
    label: "Asphalt Shingles",
    aliases: [
      "asphalt shingles",
      "shingles",
      "roof shingles",
      "architectural shingles",
      "dimensional shingles",
      "laminate shingles",
      "laminated shingles",
      "3-tab shingles",
      "three tab shingles",
      "designer shingles",
      "composition shingles",
      "comp shingles"
    ]
  },
  {
    id: "metal_roofing",
    label: "Metal Roofing",
    aliases: [
      "metal roofing",
      "metal roof",
      "metal panels",
      "roof panels",
      "standing seam",
      "corrugated metal roofing",
      "rib panel",
      "r-panel",
      "ag panel",
      "5v metal",
      "metal roof panels"
    ]
  },
  {
    id: "wood_roofing",
    label: "Wood Roofing",
    aliases: [
      "wood roofing",
      "wood shingles",
      "wood shakes",
      "cedar shakes",
      "cedar shingles",
      "shake roof",
      "wood shake roof"
    ]
  },
  {
    id: "tile_roofing",
    label: "Tile Roofing",
    aliases: [
      "tile roofing",
      "roof tile",
      "clay tile roofing",
      "concrete tile roofing",
      "barrel tile",
      "Spanish tile",
      "mission tile"
    ]
  },
  {
    id: "slate_roofing",
    label: "Slate Roofing",
    aliases: [
      "slate roofing",
      "slate roof",
      "natural slate",
      "synthetic slate",
      "slate shingles"
    ]
  },
  {
    id: "roofing_accessories",
    label: "Roofing Accessories",
    aliases: [
      "roofing accessories",
      "roof accessories",
      "ridge cap",
      "hip and ridge",
      "drip edge",
      "flashing",
      "step flashing",
      "pipe boot",
      "pipe flashing",
      "roof vent",
      "ridge vent",
      "underlayment",
      "synthetic underlayment",
      "felt paper",
      "starter strip",
      "starter shingles",
      "ice and water shield",
      "roof sealant",
      "roofing nails"
    ]
  },
  {
    id: "roofing_insulation",
    label: "Roofing Insulation",
    aliases: [
      "roofing insulation",
      "roof insulation",
      "polyiso",
      "polyisocyanurate",
      "iso board",
      "tapered insulation",
      "rigid insulation",
      "cover board"
    ]
  }
];

export const roofingBrands: RoofingBrand[] = [
  {
    id: "gaf",
    label: "GAF",
    aliases: ["gaf", "timberline", "timberline hdz"],
    subcategoryIds: ["asphalt_shingles", "roofing_accessories"]
  },
  {
    id: "certainteed",
    label: "CertainTeed",
    aliases: ["certainteed", "landmark shingles", "landmark pro"],
    subcategoryIds: ["asphalt_shingles", "roofing_accessories"]
  },
  {
    id: "owens_corning",
    label: "Owens Corning",
    aliases: ["owens corning", "duration shingles", "oakridge shingles"],
    subcategoryIds: ["asphalt_shingles", "roofing_accessories", "roofing_insulation"]
  },
  {
    id: "tamko",
    label: "TAMKO",
    aliases: ["tamko", "heritage shingles"],
    subcategoryIds: ["asphalt_shingles", "roofing_accessories"]
  },
  {
    id: "iko",
    label: "IKO",
    aliases: ["iko", "cambridge shingles", "dynasty shingles"],
    subcategoryIds: ["asphalt_shingles", "roofing_accessories"]
  },
  {
    id: "atlas",
    label: "Atlas",
    aliases: ["atlas", "pinnacle pristine", "stormmaster"],
    subcategoryIds: ["asphalt_shingles", "roofing_accessories", "roofing_insulation"]
  },
  {
    id: "malarkey",
    label: "Malarkey",
    aliases: ["malarkey", "malarkey roofing", "vista shingles", "legacy shingles"],
    subcategoryIds: ["asphalt_shingles"]
  },
  {
    id: "drexel_metals",
    label: "Drexel Metals",
    aliases: ["drexel metals", "drexel"],
    subcategoryIds: ["metal_roofing"]
  },
  {
    id: "mcelroy_metal",
    label: "McElroy Metal",
    aliases: ["mcelroy metal", "mc elroy metal"],
    subcategoryIds: ["metal_roofing"]
  }
];

export const roofingLinkKeywords = [
  "roofing",
  "roof",
  "shingles",
  "asphalt",
  "metal",
  "wood",
  "tile",
  "slate",
  "accessories",
  "insulation",
  "underlayment",
  "brands",
  "manufacturers",
  "products"
];
