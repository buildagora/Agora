"use client";

import { useEffect } from "react";

/**
 * Hook to track iOS visual viewport height for keyboard-safe layouts.
 * 
 * iOS Safari keyboard changes the visual viewport, not the window height.
 * This hook sets --vvh CSS variable to visualViewport.height (or window.innerHeight fallback),
 * allowing chat containers to size correctly when keyboard opens/closes.
 */
export function useVisualViewportHeight() {
  useEffect(() => {
    const updateHeight = () => {
      const height = window.visualViewport?.height ?? window.innerHeight;
      document.documentElement.style.setProperty("--vvh", `${height}px`);
    };

    // Set initial height
    updateHeight();

    // Update on visual viewport resize (iOS keyboard)
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", updateHeight);
      window.visualViewport.addEventListener("scroll", updateHeight);
    }

    // Update on window resize (fallback)
    window.addEventListener("resize", updateHeight);

    return () => {
      if (window.visualViewport) {
        window.visualViewport.removeEventListener("resize", updateHeight);
        window.visualViewport?.removeEventListener("scroll", updateHeight);
      }
      window.removeEventListener("resize", updateHeight);
    };
  }, []);
}

