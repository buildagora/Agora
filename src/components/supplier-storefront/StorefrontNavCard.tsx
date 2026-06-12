import Link from "next/link";
import type { StorefrontNavKind } from "@/lib/search/storefront/types";
import StorefrontImage from "./StorefrontImage";

function navImageSlot(kind: StorefrontNavKind): "brand" | "category" {
  return kind === "brand" ? "brand" : "category";
}

export default function StorefrontNavCard({
  item,
  href,
}: {
  item: { label: string; kind: StorefrontNavKind; imageUrl?: string | null };
  href: string;
}) {
  const slot = navImageSlot(item.kind);

  return (
    <Link
      href={href}
      className="block w-44 shrink-0 snap-start rounded-xl border border-zinc-200 bg-white p-3 shadow-sm transition hover:border-zinc-300 hover:shadow-md sm:w-48"
    >
      <div className="mb-3 flex h-24 items-center justify-center overflow-hidden rounded-lg border border-zinc-100 bg-white">
        <StorefrontImage
          slot={slot}
          label={item.label}
          imageUrl={item.imageUrl}
          variant="full"
          className="h-full w-full"
          imageClassName="h-full w-full object-contain p-2"
        />
      </div>
      <p className="line-clamp-2 text-sm font-semibold text-zinc-900">{item.label}</p>
    </Link>
  );
}
