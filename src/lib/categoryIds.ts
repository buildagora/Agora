// src/lib/categoryIds.ts

export const labelToCategoryId = {
    Roofing: "roofing",
    HVAC: "hvac",
    Electrical: "electrical",
    Plumbing: "plumbing",
    Framing: "framing",
    Drywall: "drywall",
    Concrete: "concrete",
    "Lumber / Siding": "lumber_siding",
    "Lumber/Siding": "lumber_siding",
  } as const;
  
  export const categoryIdToLabel = {
    roofing: "Roofing",
    hvac: "HVAC",
    electrical: "Electrical",
    plumbing: "Plumbing",
    framing: "Framing",
    drywall: "Drywall",
    concrete: "Concrete",
    lumber_siding: "Lumber / Siding",
  } as const;
  
  export type CategoryId = keyof typeof categoryIdToLabel;
  export type CategoryLabel = keyof typeof labelToCategoryId;
  