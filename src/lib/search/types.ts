/**
 * Shared types for supplier search. Safe to import from client and server.
 */

export type MatchStatus = "likely" | "unlikely" | "unknown";

export type SupplierCard = {
  supplierId: string;
  name: string;
  category: string;
  street: string;
  city: string;
  state: string;
  phone: string | null;
  distanceMiles: number;
  /** Optional — only present when a richer per-supplier verification was run. */
  status?: MatchStatus;
  /** Optional — short verification note, set when present. */
  note?: string;
  /** Optional — URL cited as the source. */
  sourceUrl?: string;
};

export type SearchResult = {
  searchId: string;
  threadId: string;
  query: string;
  /** The category Gemini inferred from the query. Null if it couldn't classify. */
  category: string | null;
  location: { label: string; lat: number; lng: number };
  /** Search radius in miles. */
  radiusMiles: number;
  /** Status of the run itself. "running" while still working. */
  status: "running" | "complete" | "error";
  /** Cards returned, sorted by distance. */
  cards: SupplierCard[];
  /** Set on status === "error". */
  error?: string;
  createdAt: string;
};
