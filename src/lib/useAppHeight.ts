"use client";

import { useEffect } from "react";

/**
 * Hook to set CSS variable --app-height for iOS keyboard-safe layouts.
 * 
 * iOS Safari has issues with 100vh/dvh when the keyboard is open.
 * This hook sets --app-height to window.innerHeight, which updates
 * when the keyboard opens/closes, allowing us to use a stable container height.
 */
export function useAppHeight() {
  useEffect(() => {
    const setAppHeight = () => {
      const height = window.innerHeight;
      document.documentElement.style.setProperty("--app-height", `${height}px`);
    };

    // Set initial height
    setAppHeight();

    // Update on window resize
    window.addEventListener("resize", setAppHeight);

    // Update on visual viewport change (iOS keyboard)
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", setAppHeight);
    }

    return () => {
      window.removeEventListener("resize", setAppHeight);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener("resize", setAppHeight);
      }
    };
  }, []);
}



