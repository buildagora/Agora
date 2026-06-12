import StorefrontImage from "./StorefrontImage";

export function ProductPlaceholderTile({
  className,
}: {
  label?: string;
  initials?: string;
  className?: string;
}) {
  return <StorefrontImage slot="product" label="" variant="product" className={className} />;
}

export default function StorefrontProductCardImage({
  title,
  imageUrl,
}: {
  title: string;
  imageUrl?: string | null;
  brand?: string | null;
}) {
  return (
    <StorefrontImage
      slot="product"
      label={title}
      imageUrl={imageUrl}
      variant="product"
      className="block w-full"
      imageClassName="aspect-square w-full rounded-lg object-contain bg-zinc-50 p-2"
    />
  );
}
