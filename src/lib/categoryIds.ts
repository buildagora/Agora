// src/lib/categoryIds.ts

export const labelToCategoryId = {
    Roofing: "roofing",
    HVAC: "hvac",
    Electrical: "electrical",
    Plumbing: "plumbing",
    Framing: "framing",
    Drywall: "drywall",
    Concrete: "concrete",
  } as const;
  
  export const categoryIdToLabel = {
    roofing: "Roofing",
    hvac: "HVAC",
    electrical: "Electrical",
    plumbing: "Plumbing",
    framing: "Framing",
    drywall: "Drywall",
    concrete: "Concrete",
  } as const;
  
  export type CategoryId = keyof typeof categoryIdToLabel;
  export type CategoryLabel = keyof typeof labelToCategoryId;
  