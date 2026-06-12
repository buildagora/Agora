export type PilotProductResult = {
  supplier: string;
  query: string;
  title: string;
  brand: string | null;
  price: string | null;
  imageUrl: string | null;
  productUrl: string;
  classification: "PRODUCT_PAGE";
};

export type CityElectricPilotReport = {
  pilotVersion: "0.1";
  supplier: "City Electric Supply";
  supplierId: "city_electric_hsv";
  domain: "cityelectricsupply.com";
  query: string;
  mode: "headed-playwright";
  runAt: string;
  pass: boolean;
  cloudflareBypassed: boolean;
  manualValidationNotes: string;
  productCount: number;
  products: PilotProductResult[];
  finalUrl: string;
  errors: string[];
  timingsMs: {
    total: number;
    navigation: number;
    extraction: number;
  };
  artifacts?: {
    screenshotPath?: string;
    htmlSnapshotPath?: string;
  };
};
