export type SupplierProductSource =
  | "HOME_DEPOT"
  | "LOWES"
  | "ABC_SUPPLY"
  | "FERGUSON"
  | "GRAINGER"
  | "QXO"
  | "SRS"
  | "GULFEAGLE"
  | "LANSING";

export type SupplierProductResult = {
  supplierId: string;
  title: string;
  brand?: string | null;
  imageUrl?: string | null;
  price?: string | null;
  productUrl?: string | null;
  source: SupplierProductSource;
  availability?: string | null;
};
