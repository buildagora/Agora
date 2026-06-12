export function filterProductsByAttributes<
  T extends { title: string; brand?: string | null }
>(products: T[], filters: Record<string, string>): T[] {
  const entries = Object.entries(filters);
  if (entries.length === 0) return products;

  return products.filter((product) => {
    const haystack = `${product.title} ${product.brand ?? ""}`.toLowerCase();
    return entries.every(([, value]) => haystack.includes(value.toLowerCase()));
  });
}
