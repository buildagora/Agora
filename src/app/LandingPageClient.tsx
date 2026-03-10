"use client";

/**
 * Landing Page Component
 * 
 * NOTE: Static assets (images, fonts, etc.) must be placed in ./agora/public/
 * because the Next.js app runs from the ./agora directory, not the repo root.
 * 
 * Example: The hero image at /landing/agora-landing.png is served from
 * ./agora/public/landing/agora-landing.png
 */

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import AgoraLogo from "@/components/brand/AgoraLogo";
import Button from "@/components/ui2/Button";

function CardImage({
  src,
  alt,
  placeholder,
  zoom,
  filter,
}: {
  src: string;
  alt: string;
  placeholder: string;
  zoom?: number;
  filter?: string;
}) {
  const [hasError, setHasError] = useState(false);

  if (hasError) {
    return (
      <div className="mb-4 aspect-[16/9] w-full rounded-lg bg-zinc-100 flex items-center justify-center">
        <div className="text-zinc-400 text-4xl">{placeholder}</div>
      </div>
    );
  }

  const imageStyle: React.CSSProperties = {};
  if (zoom) {
    imageStyle.transform = `scale(${zoom})`;
  }
  if (filter) {
    imageStyle.filter = filter;
  }

  return (
    <div className="mb-4 aspect-[16/9] w-full rounded-lg overflow-hidden bg-zinc-100">
      <Image
        src={src}
        alt={alt}
        width={400}
        height={225}
        className="w-full h-full object-cover"
        style={imageStyle}
        onError={() => setHasError(true)}
      />
    </div>
  );
}

export default function LandingPageClient() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <div className="bg-zinc-50">
      {/* Top Navigation */}
      <nav className="relative z-50 w-full border-b border-zinc-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <AgoraLogo variant="auth" />
            <Link href="/auth/sign-in">
              <Button variant="outline" size="md">
                Sign In
              </Button>
            </Link>
          </div>
        </div>
      </nav>

      <main>
        {/* ZONE 2 - Hero Section - Full-bleed */}
        <section 
          className="relative w-screen overflow-hidden"
          style={{ 
            height: "clamp(520px, 62vh, 740px)",
            marginLeft: 'calc(50% - 50vw)',
            marginRight: 'calc(50% - 50vw)'
          }}
        >
          {/* Subtle gradient overlay for text readability */}
          <div className="absolute inset-0 bg-gradient-to-b from-white/60 via-white/10 to-transparent z-10" />

          {/* Hero Image - Full width, full height */}
          <div className="absolute inset-0">
            <Image
              src="/landing/agora-landing.png"
              alt="Agora - Operating System for Construction Materials"
              fill
              className="object-cover"
              style={{ objectPosition: "center 30%" }}
              priority
              sizes="100vw"
            />
          </div>

          {/* Text Overlay - SINGLE overlay positioned in upper sky area (mounted guard prevents duplicate) */}
          {mounted && (
            <div className="absolute left-0 right-0 top-[6%] md:top-[8%] flex flex-col items-center px-4 z-20">
              <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight text-slate-900 text-center drop-shadow-sm">
                Construction Supply, Rebuilt.
              </h1>
              <p className="mt-4 sm:mt-6 text-lg sm:text-xl md:text-2xl font-normal text-slate-900 text-center drop-shadow-sm max-w-3xl">
                Connecting contractors and suppliers in one system.
              </p>
            </div>
          )}
        </section>

        {/* Cards Section - Overlap hero like mockup */}
        <section className="relative z-20 max-w-6xl mx-auto px-6 -mt-14 sm:-mt-16 md:-mt-20 pb-4 sm:pb-6">
          <div className="grid gap-6 md:grid-cols-3">
            {/* Card 1: For Buyers */}
            <Link
              href="/buyers"
              className="group rounded-xl bg-white p-8 shadow-sm border border-zinc-200 hover:shadow-md hover:border-zinc-300 hover:-translate-y-1 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2"
            >
              <CardImage
                src="/landing/card-buyers.png"
                alt="Agora buyers procurement"
                placeholder="📦"
                zoom={1.12}
              />
              <h3 className="text-2xl font-semibold text-slate-900 mb-4">
                For Buyers
              </h3>
              <p className="text-slate-600 leading-relaxed">
                One request. Every supplier. Real competition. Clear pricing.
              </p>
            </Link>

            {/* Card 2: For Suppliers */}
            <Link
              href="/suppliers"
              className="group rounded-xl bg-white p-8 shadow-sm border border-zinc-200 hover:shadow-md hover:border-zinc-300 hover:-translate-y-1 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2"
            >
              <CardImage
                src="/landing/card-suppliers.png"
                alt="Agora suppliers quoting and fulfillment"
                placeholder="🏗️"
                filter="brightness(1.07) contrast(0.97)"
              />
              <h3 className="text-2xl font-semibold text-slate-900 mb-4">
                For Suppliers
              </h3>
              <p className="text-slate-600 leading-relaxed">
                Submit quotes, fulfill orders, and grow your business.
              </p>
            </Link>

            {/* Card 3: About Agora */}
            <Link
              href="/about"
              className="group rounded-xl bg-white p-8 shadow-sm border border-zinc-200 hover:shadow-md hover:border-zinc-300 hover:-translate-y-1 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2"
            >
              <CardImage src="/landing/card-about.png" alt="About Agora" placeholder="ℹ️" />
              <h3 className="text-2xl font-semibold text-slate-900 mb-4">
                About Agora
              </h3>
              <p className="text-slate-600 leading-relaxed">
                The operating system for construction materials—connecting contractors and suppliers in one system.
              </p>
            </Link>
          </div>
        </section>

        {/* Get Started CTA - Centered below cards */}
        <div className="max-w-6xl mx-auto px-6 mt-4 sm:mt-6 pb-16 sm:pb-20 flex items-center justify-center">
          <Link href="/auth/sign-in">
            <Button variant="primary" size="lg">
              Get Started
            </Button>
          </Link>
        </div>
      </main>
    </div>
  );
}

