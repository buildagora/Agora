import { cabinetsCountertopsOntologyCategory } from "./categories/cabinetsCountertops";
import { brickOntologyCategory } from "./categories/brick";
import { concreteCementOntologyCategory } from "./categories/concreteCement";
import { deckingRailingOntologyCategory } from "./categories/deckingRailing";
import { drywallOntologyCategory } from "./categories/drywall";
import { electricalOntologyCategory } from "./categories/electrical";
import { fencingOntologyCategory } from "./categories/fencing";
import { flooringOntologyCategory } from "./categories/flooring";
import { glassGlazingOntologyCategory } from "./categories/glassGlazing";
import { gutterDrainageOntologyCategory } from "./categories/gutterDrainage";
import { hardwareFastenersOntologyCategory } from "./categories/hardwareFasteners";
import { hvacOntologyCategory } from "./categories/hvac";
import { insulationOntologyCategory } from "./categories/insulation";
import { landscapingOntologyCategory } from "./categories/landscaping";
import { lumberSidingOntologyCategory } from "./categories/lumberSiding";
import { paintOntologyCategory } from "./categories/paint";
import { plumbingOntologyCategory } from "./categories/plumbing";
import { roofingOntologyCategory } from "./categories/roofing";
import { steelMetalOntologyCategory } from "./categories/steelMetal";
import { tileStoneOntologyCategory } from "./categories/tileStone";
import { toolsEquipmentOntologyCategory } from "./categories/toolsEquipment";
import { windowsDoorsOntologyCategory } from "./categories/windowsDoors";
import type {
  ConstructionBrand,
  ConstructionOntologyCategory,
  ConstructionProductType,
  OntologyQueryMatch,
} from "./types";

export const ontologyCategories: ConstructionOntologyCategory[] = [
  plumbingOntologyCategory,
  electricalOntologyCategory,
  drywallOntologyCategory,
  roofingOntologyCategory,
  hvacOntologyCategory,
  concreteCementOntologyCategory,
  lumberSidingOntologyCategory,
  insulationOntologyCategory,
  steelMetalOntologyCategory,
  flooringOntologyCategory,
  tileStoneOntologyCategory,
  paintOntologyCategory,
  windowsDoorsOntologyCategory,
  cabinetsCountertopsOntologyCategory,
  hardwareFastenersOntologyCategory,
  toolsEquipmentOntologyCategory,
  fencingOntologyCategory,
  landscapingOntologyCategory,
  deckingRailingOntologyCategory,
  gutterDrainageOntologyCategory,
  glassGlazingOntologyCategory,
  brickOntologyCategory,
];

export function findOntologyCategory(categoryId: string): ConstructionOntologyCategory | null {
  return ontologyCategories.find((category) => category.categoryId === categoryId) ?? null;
}

function normalizeQuery(query: string): string {
  return query.trim().toLowerCase().replace(/\s+/g, " ");
}

function matchesAnyTerm(query: string, terms: string[]): boolean {
  return terms.some((term) => query.includes(term.toLowerCase()));
}

const GENERIC_ONTOLOGY_TERMS = new Set([
  "pipe",
  "panel",
  "box",
  "fitting",
  "tape",
  "wire",
  "board",
  "texture",
  "conduit",
  "valve",
  "cable",
  "corner",
]);

function isGenericOntologyTerm(term: string): boolean {
  return GENERIC_ONTOLOGY_TERMS.has(term.trim().toLowerCase());
}

function countPositiveTermMatches(query: string, positiveTerms: string[]): string[] {
  const seen = new Set<string>();
  const matches: string[] = [];
  for (const term of positiveTerms) {
    const normalized = term.toLowerCase().trim();
    if (!normalized || seen.has(normalized)) continue;
    if (query.includes(normalized)) {
      seen.add(normalized);
      matches.push(normalized);
    }
  }
  return matches;
}

function hasStrongPositiveTermMatch(query: string, positiveTerms: string[]): boolean {
  const matchedTerms = countPositiveTermMatches(query, positiveTerms);
  if (matchedTerms.length >= 2) return true;
  if (matchedTerms.length === 0) return false;

  // Precision-first ontology matching: allow a single positive-term hit only
  // when the term is specific enough. Broad recall is handled by base search fallback.
  return !isGenericOntologyTerm(matchedTerms[0]);
}

function filterMatchedProductTypes(
  query: string,
  productTypes: ConstructionProductType[],
): ConstructionProductType[] {
  return productTypes.filter((productType) => {
    const aliasMatch = matchesAnyTerm(query, productType.aliases);
    if (aliasMatch) return true;

    const positiveTermMatch = hasStrongPositiveTermMatch(query, productType.positiveTerms);
    return aliasMatch || positiveTermMatch;
  });
}

function filterMatchedBrands(query: string, brands: ConstructionBrand[]): ConstructionBrand[] {
  return brands.filter((brand) => matchesAnyTerm(query, brand.aliases));
}

/**
 * Optional enrichment only. Core search must continue working even when ontology returns no matches.
 */
export function searchOntologyByQuery(query: string): OntologyQueryMatch[] {
  const normalizedQuery = normalizeQuery(query);
  if (!normalizedQuery) return [];

  return ontologyCategories
    .map((category) => {
      const productTypes = filterMatchedProductTypes(normalizedQuery, category.productTypes);
      const brands = filterMatchedBrands(normalizedQuery, category.brands);

      return {
        categoryId: category.categoryId,
        categoryLabel: category.label,
        productTypes,
        brands,
      } satisfies OntologyQueryMatch;
    })
    .filter((match) => match.productTypes.length > 0 || match.brands.length > 0);
}

export type {
  ConstructionBrand,
  ConstructionOntologyCategory,
  ConstructionOntologyCoverageLevel,
  ConstructionProductType,
  OntologyQueryMatch,
} from "./types";

