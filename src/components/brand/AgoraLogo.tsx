"use client";

import Link from "next/link";
import AgoraMark from "./AgoraMark";

interface AgoraLogoProps {
  variant?: "buyer" | "seller" | "auth";
  className?: string;
}

/**
 * AgoraLogo - Single source of truth for Agora brand lockup
 * 
 * Renders: [AgoraMark SVG] + "Agora" text
 * 
 * This is the ONLY logo component. All brand usages must use this component
 * to prevent drift and ensure consistency across the entire app.
 * 
 * The "A" mark is provided by AgoraMark component - do not modify or regenerate elsewhere.
 */
export default function AgoraLogo({ 
  variant = "auth",
  className = ""
}: AgoraLogoProps) {
  // Determine home route based on variant
  const getHomeRoute = () => {
    switch (variant) {
      case "buyer":
        return "/buyer/dashboard";
      case "seller":
        return "/seller/dashboard";
      case "auth":
      default:
        return "/";
    }
  };

  const homeRoute = getHomeRoute();
  const wordmarkClass =
    variant === "auth"
      ? "text-[22px] font-bold leading-none text-[#111]"
      : "text-[22px] font-bold leading-none text-[#111]";

  // Icon size matches the standard brand lockup
  const iconSize = 28;
  
  const logoContent = (
    <div className={`inline-flex items-center gap-[11px] ${className}`}>
      {/* Official Agora mark */}
      <AgoraMark 
        size={iconSize} 
        className="flex-shrink-0 text-[#2F3B4A]"
      />
      {/* "Agora" wordmark */}
      <span className={wordmarkClass}>
        Agora
      </span>
    </div>
  );

  return (
    <Link 
      href={homeRoute}
      className="hover:opacity-80 transition-opacity"
      aria-label="Go to Agora home"
    >
      {logoContent}
    </Link>
  );
}
