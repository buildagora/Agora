import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/auth/AuthProvider";
import { Analytics } from "@vercel/analytics/next";

// Font loading with error handling - these are synchronous but Next.js handles them
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap", // Fail fast if font can't load
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap", // Fail fast if font can't load
});

export const metadata: Metadata = {
  title: "Agora",
  description:
    "Chat-driven supplier discovery for construction materials. Tell us what you need; we'll show local suppliers that carry it.",
  // Stop iOS Safari from auto-wrapping phone numbers / addresses / emails
  // in `tel:` / `geo:` / `mailto:` links — that DOM rewrite runs after the
  // initial parse but before React hydrates, causing hydration mismatches
  // wherever we render those as plain text (supplier hero, address line,
  // operator notes, etc.).
  formatDetection: {
    telephone: false,
    address: false,
    email: false,
  },
};

/**
 * Required for mobile rendering — without this, mobile browsers fall back to
 * a virtual 980px viewport, zoom way out, and the entire app is unusable on
 * a phone. Width=device-width + initial-scale=1 is the standard mobile
 * baseline. Allowing user-scaling up to 5x is an a11y must (don't lock
 * zoom).
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  console.log("[SERVER] RootLayout: rendering start");
  
  // Root layout is synchronous - no blocking operations
  // If this hangs, it's a Next.js issue, not our code
  const result = (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <AuthProvider>
          {children}
        </AuthProvider>
        <Analytics />
      </body>
    </html>
  );
  
  console.log("[SERVER] RootLayout: rendering complete");
  return result;
}
