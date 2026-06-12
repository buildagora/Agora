import type { ReactNode } from "react";

export default function StorefrontSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-zinc-200 bg-white px-5 py-5 shadow-sm sm:px-6 sm:py-6">
      <h2 className="text-base font-semibold text-zinc-900 sm:text-lg">{title}</h2>
      {description ? (
        <p className="mt-1 text-sm text-zinc-500">{description}</p>
      ) : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}
