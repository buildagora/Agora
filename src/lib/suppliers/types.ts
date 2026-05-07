export type SupplierProductSource =
  | "HOME_DEPOT"
  | "LOWES"
  | "ABC_SUPPLY"
  | "FERGUSON"
  | "GRAINGER"
  | "QXO"
  | "SRS"
  | "GULFEAGLE"
  | "LANSING"
  | "BAKER"
  | "JOHNSTONE"
  | "LENNOX"
  | "MA_SUPPLY"
  | "MINGLEDORFFS"
  | "RE_MICHEL"
  | "SHEARER"
  | "TRANE"
  | "WITTICHEN"
  | "ECMD"
  | "GENERIC";

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
