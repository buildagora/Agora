"use client";

import Image from "next/image";
import Link from "next/link";
import AgoraMark from "./AgoraMark";

/** App destination + presentation preset for the logo */
export type AgoraLogoVariant =
  | "buyer"
  | "seller"
  | "auth"
  | "icon"
  | "hero"
  | "header";

const HERO_LOCKUP_SRC = "/brand/agora-hero-lockup.png";
const HERO_LOCKUP_W = 880;
const HERO_LOCKUP_H = 208;

interface AgoraLogoProps {
  variant?: AgoraLogoVariant;
  className?: string;
}

/**
 * AgoraLogo — `hero` uses the horizontal lockup PNG; other lockups use SVG + text.
 */
export default function AgoraLogo({
  variant = "auth",
  className = "",
}: AgoraLogoProps) {
  const getHomeRoute = () => {
    switch (variant) {
      case "buyer":
        return "/buyer/dashboard";
      case "seller":
        return "/seller/dashboard";
      case "hero":
      case "header":
      case "icon":
      case "auth":
      default:
        return "/";
    }
  };

  const homeRoute = getHomeRoute();

  const getIconSize = () => {
    switch (variant) {
      case "header":
        return 24;
      case "icon":
        return 28;
      default:
        return 28;
    }
  };

  const iconSize = getIconSize();

  const wordmarkClass =
    variant === "header"
      ? "text-[20px] font-semibold leading-none tracking-tight text-[#1E3A5F]"
      : "text-[22px] font-semibold leading-none tracking-tight text-[#1E3A5F]";

  const gapClass = "gap-[11px]";

  if (variant === "hero") {
    return (
      <Link
        href={homeRoute}
        className={`inline-block max-w-full shrink-0 leading-none hover:opacity-80 transition-opacity ${className}`}
        aria-label="Go to Agora home"
      >
        <Image
          src={HERO_LOCKUP_SRC}
          alt="Agora"
          width={HERO_LOCKUP_W}
          height={HERO_LOCKUP_H}
          className="block h-[56px] w-auto object-contain object-center sm:h-[62px] md:h-[68px] lg:h-[74px]"
          priority
        />
      </Link>
    );
  }

  if (variant === "icon") {
    return (
      <Link
        href={homeRoute}
        className={`inline-flex shrink-0 items-center justify-center hover:opacity-80 transition-opacity ${className}`}
        aria-label="Go to Agora home"
      >
        <AgoraMark
          size={iconSize}
          className="flex-shrink-0 text-[#1E3A5F]"
        />
      </Link>
    );
  }

  return (
    <Link
      href={homeRoute}
      className={`inline-flex shrink-0 items-center leading-none hover:opacity-80 transition-opacity ${className}`}
      aria-label="Go to Agora home"
    >
      <div className={`inline-flex items-center ${gapClass}`}>
        <AgoraMark
          size={iconSize}
          className="flex-shrink-0 text-[#1E3A5F]"
        />
        <span className={wordmarkClass}>AGORA</span>
      </div>
    </Link>
  );
}
