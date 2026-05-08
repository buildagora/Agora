export type ShoppingResultImage = {
  thumbnail?: string;
  original?: string;
};

export type ShoppingResultItem = {
  title?: string;
  brand?: string | null;
  thumbnail?: string;
  serpapi_thumbnail?: string;
  images?: ShoppingResultImage[];
  link?: string;
  product_link?: string;
  serpapi_immersive_product_api?: string;
  price?: string;
};

export type RankedShoppingResult = {
  item: ShoppingResultItem;
  score: number;
  rankingSignals: string[];
};

