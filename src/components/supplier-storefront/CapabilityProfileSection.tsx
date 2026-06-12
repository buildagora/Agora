import type { SupplierProductResult } from "@/lib/suppliers/types";
import {
  CAPABILITY_PROFILE_DISCLAIMER,
  getCapabilityProfileCardDisplay,
} from "@/lib/suppliers/capability/capabilityProfileDisplay";

export default function CapabilityProfileSection({
  profiles,
  telHref,
  sectionTitle = "Likely carries",
  sectionDescription = "Inferred from supplier capability data. Not live inventory or pricing.",
}: {
  profiles: SupplierProductResult[];
  telHref?: string | null;
  sectionTitle?: string;
  sectionDescription?: string;
}) {
  if (profiles.length === 0) return null;

  return (
    <section className="rounded-2xl border border-sky-200/80 bg-sky-50/30 px-5 py-5 shadow-sm sm:px-7 sm:py-6">
      <h2 className="text-base font-semibold text-zinc-900 sm:text-lg">
        {sectionTitle}
      </h2>
      <p className="mt-1 text-sm text-zinc-600">{sectionDescription}</p>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        {profiles.map((profile, i) => {
          const display = getCapabilityProfileCardDisplay(profile, telHref);
          const cardKey = `${profile.title}-${profile.productUrl ?? i}`;

          const cta =
            display.ctaHref != null ? (
              display.ctaExternal ? (
                <a
                  href={display.ctaHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-flex text-xs font-medium text-sky-800 hover:text-sky-950"
                >
                  {display.ctaLabel} →
                </a>
              ) : (
                <a
                  href={display.ctaHref}
                  className="mt-3 inline-flex text-xs font-medium text-sky-800 hover:text-sky-950"
                >
                  {display.ctaLabel} →
                </a>
              )
            ) : (
              <p className="mt-3 text-xs text-zinc-500">{display.ctaLabel}</p>
            );

          return (
            <div
              key={cardKey}
              className="rounded-xl border border-sky-200/70 bg-white p-4 shadow-sm"
            >
              <h3 className="line-clamp-2 text-sm font-semibold text-zinc-900">
                {profile.title}
              </h3>
              {profile.brand ? (
                <p className="mt-1 text-xs text-zinc-500">{profile.brand}</p>
              ) : null}
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center rounded-md border border-sky-200 bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-900">
                  {display.badge}
                </span>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-zinc-500">
                {CAPABILITY_PROFILE_DISCLAIMER}
              </p>
              {cta}
            </div>
          );
        })}
      </div>
    </section>
  );
}
