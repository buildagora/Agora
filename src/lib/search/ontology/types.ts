export type ConstructionOntologyCoverageLevel = "baseline" | "developing" | "mature";

export type ConstructionProductType = {
  id: string;
  label: string;
  aliases: string[];
  positiveTerms: string[];
  negativeTerms: string[];
};

export type ConstructionBrand = {
  id: string;
  label: string;
  aliases: string[];
};

export type ConstructionOntologyCategory = {
  categoryId: string;
  label: string;
  coverageLevel: ConstructionOntologyCoverageLevel;
  productTypes: ConstructionProductType[];
  brands: ConstructionBrand[];
  ambiguousTerms: string[];
};

export type OntologyQueryMatch = {
  categoryId: string;
  categoryLabel: string;
  productTypes: ConstructionProductType[];
  brands: ConstructionBrand[];
};

