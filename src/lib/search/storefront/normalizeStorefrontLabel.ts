/** Normalize storefront labels for registry lookup and Serp merge matching. */
export function normalizeStorefrontLabel(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

export function storefrontLabelKey(value: string): string {
  return normalizeStorefrontLabel(value);
}

export function brandInitials(label: string): string {
  const words = normalizeStorefrontLabel(label)
    .split(" ")
    .filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return (words[0]![0] ?? "") + (words[1]![0] ?? "");
}
