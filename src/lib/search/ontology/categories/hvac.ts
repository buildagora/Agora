import type { ConstructionOntologyCategory } from "../types";

export const hvacOntologyCategory: ConstructionOntologyCategory = {
  categoryId: "hvac",
  label: "HVAC",
  coverageLevel: "baseline",
  productTypes: [
    {
      id: "condenser",
      label: "Condenser",
      aliases: ["condenser", "ac condenser", "condensing unit", "outdoor condenser"],
      positiveTerms: ["condenser", "ac condenser", "condensing unit", "outdoor condenser"],
      negativeTerms: ["air compressor", "generator"],
    },
    {
      id: "air-handler",
      label: "Air Handler",
      aliases: ["air handler", "fan coil unit", "ahu"],
      positiveTerms: ["air handler", "fan coil", "ahu"],
      negativeTerms: ["shop fan", "attic fan"],
    },
    {
      id: "furnace",
      label: "Furnace",
      aliases: ["gas furnace", "electric furnace", "forced air furnace"],
      positiveTerms: ["furnace", "forced air", "gas heat"],
      negativeTerms: ["space heater", "water heater"],
    },
    {
      id: "heat-pump",
      label: "Heat Pump",
      aliases: ["heat pump", "split heat pump", "package heat pump"],
      positiveTerms: ["heat pump", "split heat pump", "package heat pump"],
      negativeTerms: ["well pump", "sump pump"],
    },
    {
      id: "ductwork",
      label: "Ductwork",
      aliases: ["hvac duct", "ductwork", "flex duct", "sheet metal duct"],
      positiveTerms: ["ductwork", "flex duct", "sheet metal duct", "duct"],
      negativeTerms: ["conduit", "drain pipe"],
    },
    {
      id: "thermostat",
      label: "Thermostat",
      aliases: ["thermostat", "smart thermostat", "programmable thermostat"],
      positiveTerms: ["thermostat", "smart thermostat", "programmable thermostat"],
      negativeTerms: ["temperature gauge", "thermometer"],
    },
    {
      id: "refrigerant-line-set",
      label: "Refrigerant Line Set",
      aliases: ["line set", "refrigerant line set", "ac line set"],
      positiveTerms: ["refrigerant line", "line set", "suction line", "liquid line"],
      negativeTerms: ["plumbing line", "water line"],
    },
    {
      id: "package-unit",
      label: "Package Unit",
      aliases: ["package unit", "rooftop unit", "rtu"],
      positiveTerms: ["package unit", "rooftop unit", "rtu"],
      negativeTerms: ["packout box", "roof vent"],
    },
  ],
  brands: [
    { id: "trane", label: "Trane", aliases: ["trane", "american standard hvac"] },
    { id: "carrier", label: "Carrier", aliases: ["carrier", "bryant"] },
    { id: "goodman", label: "Goodman", aliases: ["goodman", "amana hvac"] },
    { id: "lennox", label: "Lennox", aliases: ["lennox"] },
    { id: "rheem", label: "Rheem", aliases: ["rheem"] },
    { id: "ruud", label: "Ruud", aliases: ["ruud"] },
  ],
  ambiguousTerms: ["duct", "line set", "unit"],
};

