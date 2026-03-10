// src/lib/agent/capabilities.ts
// Minimal capability definitions (used by intentRouter). Expand later as needed.

/**
 * Minimal capability inventory used by orchestrator.
 */
export const AGENT_CAPABILITY_INVENTORY = [
  { id: "roofing", name: "Roofing" },
  { id: "hvac", name: "HVAC" },
  { id: "electrical", name: "Electrical" },
  { id: "plumbing", name: "Plumbing" },
  { id: "framing", name: "Framing" },
  { id: "drywall", name: "Drywall" },
  { id: "concrete", name: "Concrete" },
  { id: "lumber_siding", name: "Lumber & Siding" },
] as const;

export type CapabilityId = (typeof AGENT_CAPABILITY_INVENTORY)[number]["id"];
