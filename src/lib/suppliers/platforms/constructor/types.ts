import type { SupplierProductSource } from "../../types";
import type { SupplierCatalogPageOptions } from "../../supplierCatalogPageOptions";

export type ConstructorFacet = {
  name?: string;
  values?: string[];
};

export type ConstructorResultData = {
  id?: string;
  variation_id?: string;
  prdName?: string;
  value?: string;
  image_url?: string;
  prdImageUrl?: string;
  url?: string;
  facets?: ConstructorFacet[];
};

export type ConstructorSearchResult = {
  matched_terms?: string[];
  data?: ConstructorResultData;
};

export type ConstructorSearchResponse = {
  response?: {
    results?: ConstructorSearchResult[];
  };
};

export type ConstructorPlatformConfig = {
  apiKey: string;
  baseUrl: string;
  numResultsPerPage: number;
  imageCdnBase: string;
  siteOrigin: string;
};

export type ConstructorSearchParams = {
  query: string;
  supplierIds: string[];
  source: SupplierProductSource;
  logLabel: string;
  constructor: ConstructorPlatformConfig;
} & SupplierCatalogPageOptions;