import type { StorefrontExtractedAttribute } from "@/lib/search/storefront/types";

export default function AttributeChipBar({
  attributes,
}: {
  attributes: StorefrontExtractedAttribute[];
}) {
  if (attributes.length === 0) return null;

  return (
    <section className="rounded-2xl border border-sky-200 bg-sky-50/60 px-5 py-4 shadow-sm sm:px-6">
      <h2 className="text-sm font-semibold text-zinc-900">Exact match detected</h2>
      <p className="mt-1 text-sm text-zinc-600">
        We parsed these specs from your search.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {attributes.map((attr) => (
          <span
            key={attr.key}
            className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3 py-1 text-sm text-zinc-800"
          >
            <span className="text-zinc-500">{attr.label}:</span>
            <span className="font-medium">{attr.value}</span>
          </span>
        ))}
      </div>
    </section>
  );
}
