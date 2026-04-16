import AgoraLogo from "@/components/brand/AgoraLogo";

/**
 * Top marketing nav — matches the public landing strip (logo, h-16, max-w-6xl).
 * Used on the landing page and on standalone flows (e.g. public material request results).
 */
export default function SiteHeader() {
  return (
    <nav className="w-full shrink-0 border-b border-zinc-200 bg-white">
      <div className="mx-auto flex h-16 max-w-6xl items-center px-4 sm:px-6 lg:px-8">
        <AgoraLogo variant="header" />
      </div>
    </nav>
  );
}
